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
    // Timeouts: a free-proxy upstream is exactly the kind of endpoint that accepts a
    // connection and then never answers, so every stage needs its own budget.
    this.connectTimeoutMs = 10000;   // establishing the tunnel / upstream CONNECT
    this.upstreamIdleMs = 60000;     // no bytes flowing on a proxied HTTP request
    this.idleTimeoutMs = 300000;     // no bytes flowing on an established tunnel
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

  // Rebuild the upstream agent. Auto-switch (index.js --auto-switch) assigns
  // this.upstream at runtime; without this the old proxy's agent kept being used
  // and the "switch" silently did nothing.
  setUpstream(upstream) {
    this.upstream = upstream || null;
    if (this.agent) {
      try { this.agent.destroy(); } catch {}
      this.agent = null;
    }
    this.agent = this.createAgent(this.upstream);
    logger.info(`ProxyServer: Upstream set to ${upstream ? upstream.host + ':' + upstream.port : 'direct'}`);
    return true;
  }

  start(startPort = null) {
    const port = startPort || this.port;
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head));

      // Local clients (browser / panel) keep a handful of idle sockets to the proxy;
      // Node's 5s default keep-alive re-handshakes them constantly.
      this.server.keepAliveTimeout = 60000;
      this.server.headersTimeout = 65000;
      // Inactivity ceiling for accepted sockets (covers CONNECT tunnels, which
      // bypass request handling). Also reaps sockets whose peer silently vanished.
      this.server.timeout = this.idleTimeoutMs;
      this.server.on('clientError', (err, socket) => {
        try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {}
      });

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

      const failWith = (status, message) => {
        try {
          if (!res.headersSent) {
            res.writeHead(status, { 'Content-Type': 'text/plain' });
            res.end(message);
          } else if (!res.writableEnded) {
            res.destroy();
          }
        } catch {}
      };

      // Create the upstream request first: everything below (the watchdog in
      // particular) assumes it exists, and if this constructor throws we must not
      // leave a timer behind that would later dereference it.
      const proxyReq = client.request(opts, proxyRes => {
        const resHeaders = { ...proxyRes.headers };
        delete resHeaders['transfer-encoding'];
        delete resHeaders['connection'];
        resHeaders['connection'] = 'keep-alive';
        resHeaders['keep-alive'] = 'timeout=60';
        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.on('data', bump);
        proxyRes.on('error', () => { try { res.destroy(); } catch {} });
        proxyRes.pipe(res);
      });

      // Idle watchdog for the upstream leg. Free proxies frequently accept a request
      // and then never answer; without this the client socket stayed open forever.
      const onIdle = () => {
        this.errorCount++;
        logger.debug(`ProxyServer: Upstream idle timeout ${req.method} ${url.hostname}:${opts.port}`);
        try { proxyReq.destroy(); } catch {}
        failWith(504, 'Gateway Timeout');
      };
      let idleTimer = setTimeout(onIdle, this.upstreamIdleMs);
      const bump = () => { clearTimeout(idleTimer); idleTimer = setTimeout(onIdle, this.upstreamIdleMs); };
      const clearIdle = () => clearTimeout(idleTimer);
      req.on('data', bump);

      proxyReq.on('error', (err) => {
        this.errorCount++;
        logger.debug(`ProxyServer: Request error ${req.url} -> ${url.hostname}:${opts.port} - ${err.message}`);
        failWith(502, 'Bad Gateway');
      });
      proxyReq.on('close', clearIdle);

      // Client went away (or its response finished): stop pulling from the upstream
      // instead of downloading a page nobody is reading any more.
      const abortUpstream = () => {
        clearIdle();
        if (!proxyReq.destroyed) { try { proxyReq.destroy(); } catch {} }
      };
      res.on('close', () => { if (!res.writableEnded) abortUpstream(); else clearIdle(); });
      req.on('aborted', abortUpstream);
      req.on('error', abortUpstream);
      req.on('close', () => { if (!req.readableEnded) abortUpstream(); });

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

    // Client side of the tunnel also needs an inactivity ceiling (server.timeout
    // covers accepted sockets, but a silent peer should not pin resources forever).
    socket.on('error', () => {});
    socket.setTimeout(this.idleTimeoutMs, () => { try { socket.destroy(); } catch {} });

    if (this.upstream && this.upstream.type !== 'socks5') {
      this.connectViaHttpProxy(socket, head, hostname, targetPort);
    } else if (this.upstream && this.upstream.type === 'socks5') {
      this.connectViaSocks5(socket, head, hostname, targetPort);
    } else {
      this.connectDirect(socket, head, hostname, targetPort);
    }
  }

  respondConnectFailure(socket, status, message) {
    this.errorCount++;
    try {
      if (!socket.destroyed && !socket.writableEnded) {
        socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
      }
    } catch {}
    try { socket.end(); } catch {}
  }

  connectDirect(socket, head, hostname, port) {
    let connected = false;
    const target = net.connect({ port, host: hostname });
    target.setTimeout(this.connectTimeoutMs);

    target.on('connect', () => {
      connected = true;
      // Connect budget spent — from here on only inactivity matters, so a long-lived
      // tunnel is not killed after 10s of quiet.
      target.setTimeout(this.idleTimeoutMs);
      try {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) target.write(head);
        target.pipe(socket);
        socket.pipe(target);
      } catch (e) {
        try { socket.end(); } catch {}
        try { target.destroy(); } catch {}
      }
    });

    target.on('timeout', () => {
      if (connected) {
        try { target.destroy(); } catch {}
        try { socket.destroy(); } catch {}
      } else {
        this.respondConnectFailure(socket, 504, 'Gateway Timeout');
        try { target.destroy(); } catch {}
      }
    });

    target.on('error', () => {
      this.errorCount++;
      try { socket.end(); } catch {}
    });

    socket.on('error', () => {
      try { target.destroy(); } catch {}
    });
    socket.on('close', () => {
      try { target.destroy(); } catch {}
    });
  }

  connectViaHttpProxy(socket, head, hostname, port) {
    let established = false;
    const connectReq = http.request({
      hostname: this.upstream.host,
      port: this.upstream.port,
      method: 'CONNECT',
      path: `${hostname}:${port}`,
      headers: { 'Host': `${hostname}:${port}` }
    });

    const onTimeout = () => {
      try { connectReq.destroy(); } catch {}
      if (established) {
        this.errorCount++;
        try { socket.destroy(); } catch {}
      } else {
        this.respondConnectFailure(socket, 504, 'Gateway Timeout');
      }
    };
    connectReq.setTimeout(this.connectTimeoutMs, onTimeout);

    connectReq.on('connect', (res, target) => {
      if (res.statusCode === 200) {
        established = true;
        // Swap the connect budget for the idle budget (do it on the socket itself:
        // the request no longer owns the tunnel after a successful CONNECT).
        target.setTimeout(this.idleTimeoutMs);
        target.on('timeout', () => { try { target.destroy(); } catch {} try { socket.destroy(); } catch {} });
        target.on('error', () => { try { socket.destroy(); } catch {} });
        try {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length) target.write(head);
          target.pipe(socket);
          socket.pipe(target);
        } catch (e) {
          try { socket.end(); } catch {}
          try { target.destroy(); } catch {}
        }
      } else {
        this.respondConnectFailure(socket, 502, 'Bad Gateway');
        try { connectReq.destroy(); } catch {}
      }
    });

    connectReq.on('error', () => {
      this.errorCount++;
      try { socket.end(); } catch {}
    });

    socket.on('close', () => { if (!established) { try { connectReq.destroy(); } catch {} } });

    connectReq.end();
  }

  connectViaSocks5(socket, head, hostname, port) {
    try {
      const { SocksClient } = require('socks');
      const options = {
        proxy: { host: this.upstream.host, port: this.upstream.port, type: 5 },
        destination: { host: hostname, port: port },
        command: 'connect',
        timeout: this.connectTimeoutMs
      };

      SocksClient.createConnection(options).then(info => {
        const target = info.socket;
        target.setTimeout(this.idleTimeoutMs);
        target.on('timeout', () => { try { target.destroy(); } catch {} try { socket.destroy(); } catch {} });
        target.on('error', () => { try { socket.destroy(); } catch {} });
        try {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length) target.write(head);
          target.pipe(socket);
          socket.pipe(target);
        } catch (e) {
          try { socket.end(); } catch {}
          try { target.destroy(); } catch {}
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
