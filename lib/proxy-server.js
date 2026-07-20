const http = require('http');
const https = require('https');
const net = require('net');
const logger = require('./logger');

class ProxyServer {
  constructor(port, upstream) {
    this.port = port;
    this.upstream = upstream;
    this.server = null;
    this.connections = new Set();
    this.requestCount = 0;
    this.errorCount = 0;
    this.agent = this.createAgent(upstream);
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64, timeout: 60000 });
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64, timeout: 60000, rejectUnauthorized: false });
  }

  createAgent(proxy) {
    if (!proxy) return null;
    if (proxy.type === 'socks5') {
      try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        return new SocksProxyAgent(`socks5://${proxy.host}:${proxy.port}`);
      } catch {
        try {
          const { HttpProxyAgent } = require('http-proxy-agent');
          return new HttpProxyAgent(`http://${proxy.host}:${proxy.port}`);
        } catch {
          return null;
        }
      }
    } else {
      try {
        const { HttpProxyAgent } = require('http-proxy-agent');
        return new HttpProxyAgent(`http://${proxy.host}:${proxy.port}`);
      } catch {
        return null;
      }
    }
  }

  start(startPort = null) {
    const port = startPort || this.port;
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head));

      this.server.on('connection', (conn) => {
        this.connections.add(conn);
        conn.on('close', () => this.connections.delete(conn));
        conn.on('error', () => {});
      });

      this.server.listen(port, '127.0.0.1', () => {
        this.port = port;
        logger.info(`ProxyServer: Proxy server started on 127.0.0.1:${this.port}`);
        if (this.upstream) {
          logger.info(`ProxyServer: Upstream proxy: ${this.upstream.host}:${this.upstream.port} (${this.upstream.type})`);
        } else {
          logger.info('ProxyServer: Direct mode (no upstream proxy)');
        }
        resolve(true);
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          if (port < 65535) {
            logger.info(`ProxyServer: Port ${port} is in use, trying ${port + 1}...`);
            this.server = null;
            this.start(port + 1).then(resolve);
          } else {
            logger.error(`ProxyServer: Port ${port} is in use, all ports exhausted`);
            resolve(false);
          }
        } else {
          logger.error('ProxyServer: Server error: ' + err.message);
          resolve(false);
        }
      });
    });
  }

  stop() {
    if (this.server) {
      this.connections.forEach(conn => {
        try { conn.destroy(); } catch {}
      });
      this.connections.clear();
      this.server.close();
      this.server = null;
      logger.info('ProxyServer: Server stopped');
    }
    if (this.agent) {
      try { this.agent.destroy(); } catch {}
      this.agent = null;
    }
    try { this.httpAgent.destroy(); } catch {}
    try { this.httpsAgent.destroy(); } catch {}
  }

  handleRequest(req, res) {
    this.requestCount++;
    try {
      let url;
      if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
        url = new URL(req.url);
      } else {
        const match = req.url.match(/^\/(https?):\/\/([^\/]+)(\/.*)?$/);
        if (match) {
          url = new URL(match[1] + '://' + match[2] + (match[3] || '/'));
        } else {
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          url = new URL(protocol + '://' + (req.headers.host || 'localhost') + req.url);
        }
      }
      const isHttps = url.protocol === 'https:' || (url.port && parseInt(url.port) === 443);
      const client = isHttps ? https : http;

      const headers = { ...req.headers };
      delete headers['host'];
      delete headers['x-forwarded-proto'];
      delete headers['proxy-connection'];
      headers['connection'] = 'keep-alive';

      const opts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method,
        headers,
        rejectUnauthorized: false,
        agent: this.agent || (isHttps ? this.httpsAgent : this.httpAgent),
      };

      const proxyReq = client.request(opts, proxyRes => {
        const resHeaders = { ...proxyRes.headers };
        delete resHeaders['transfer-encoding'];
        delete resHeaders['connection'];
        resHeaders['connection'] = 'keep-alive';
        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        this.errorCount++;
        logger.debug(`ProxyServer: Request error ${req.url} -> ${url.hostname}:${opts.port} - ${err.message}`);
        try {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Bad Gateway');
          } else {
            res.destroy();
          }
        } catch {}
      });

      req.on('aborted', () => { try { proxyReq.destroy(); } catch {} });
      req.on('error', () => { try { proxyReq.destroy(); } catch {} });

      req.pipe(proxyReq);
    } catch (err) {
      this.errorCount++;
      logger.debug('ProxyServer: Handle request error: ' + err.message);
      try {
        if (!res.headersSent) {
          res.writeHead(400);
          res.end('Bad Request');
        }
      } catch {}
    }
  }

  handleConnect(req, socket, head) {
    const [hostname, port] = (req.url || '').split(':');
    const targetPort = parseInt(port) || 443;

    if (this.upstream && this.upstream.type !== 'socks5') {
      this.connectViaHttpProxy(socket, head, hostname, targetPort);
    } else if (this.upstream && this.upstream.type === 'socks5') {
      this.connectViaSocks5(socket, head, hostname, targetPort);
    } else {
      this.connectDirect(socket, head, hostname, targetPort);
    }
  }

  connectDirect(socket, head, hostname, port) {
    const target = net.connect(port, hostname, () => {
      try {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        target.write(head);
        target.pipe(socket);
        socket.pipe(target);
      } catch (e) {
        socket.end();
        target.destroy();
      }
    });

    target.on('error', () => {
      this.errorCount++;
      try { socket.end(); } catch {}
    });

    socket.on('error', () => {
      try { target.destroy(); } catch {}
    });
  }

  connectViaHttpProxy(socket, head, hostname, port) {
    const connectReq = http.request({
      hostname: this.upstream.host,
      port: this.upstream.port,
      method: 'CONNECT',
      path: `${hostname}:${port}`,
      headers: { 'Host': `${hostname}:${port}` }
    });

    connectReq.on('connect', (res, target) => {
      if (res.statusCode === 200) {
        try {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          target.write(head);
          target.pipe(socket);
          socket.pipe(target);
        } catch (e) {
          socket.end();
          target.destroy();
        }
      } else {
        try { socket.end(); } catch {}
      }
    });

    connectReq.on('error', () => {
      this.errorCount++;
      try { socket.end(); } catch {}
    });

    connectReq.end();
  }

  connectViaSocks5(socket, head, hostname, port) {
    try {
      const { SocksClient } = require('socks');
      const options = {
        proxy: { host: this.upstream.host, port: this.upstream.port, type: 5 },
        destination: { host: hostname, port: port },
        command: 'connect'
      };

      SocksClient.createConnection(options).then(info => {
        try {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          info.socket.write(head);
          info.socket.pipe(socket);
          socket.pipe(info.socket);
        } catch (e) {
          socket.end();
          info.socket.destroy();
        }
      }).catch(() => {
        this.errorCount++;
        try { socket.end(); } catch {}
      });
    } catch {
      this.connectDirect(socket, head, hostname, port);
    }
  }

  getStats() {
    return {
      port: this.port,
      running: this.server !== null,
      connections: this.connections.size,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      upstream: this.upstream ? { host: this.upstream.host, port: this.upstream.port, type: this.upstream.type } : null
    };
  }
}

module.exports = ProxyServer;
