# Free Proxy Tool

> Free Internet Access Tool | Cloudflare WARP + Free Proxy Pool + Web Management Panel + CLI + TUI

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](package.json)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)](index.js)

An out-of-the-box free internet access tool. Supports **Cloudflare WARP** and **free proxy pool** dual modes, with three interaction methods: Web GUI, Terminal TUI, and Electron desktop app.

---

## Features

- **Dual mode switching** — Cloudflare WARP (recommended/stable) or free SOCKS5/HTTP proxy pool
- **Auto proxy fetching** — Automatically collects from 26+ free proxy sources, updated daily
- **Smart testing & sorting** — Batch concurrent testing, auto-filters low-latency available proxies, ranked by score
- **Auto-switch + health check** — Auto-switch on proxy failure, scheduled health detection
- **Web management panel** — Dark theme, real-time WebSocket communication, dashboard/testing/WARP/stats
- **Terminal TUI** — Interactive menu interface, no browser needed
- **App proxy** — Set proxy for specific programs individually (HTTP environment variables), supports preset quick-add
- **System proxy** — One-click Windows system proxy setup, supports PAC auto-configuration
- **Media sniffing** — Extract video/audio/image direct links from web pages
- **Statistics charts** — ASCII terminal charts + HTML interactive report (Chart.js)
- **Full WARP management** — Register/connect/disconnect/mode settings/status monitoring

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 14

### Windows

```cmd
git clone https://github.com/your-username/free-proxy-tool.git
cd free-proxy-tool
npm install
node index.js gui
```

Or double-click `start-gui.bat` to launch.

### Linux / macOS

```bash
git clone https://github.com/your-username/free-proxy-tool.git
cd free-proxy-tool
npm install
node index.js gui
```

### After Starting

Open http://127.0.0.1:3000 in your browser to access the management panel.

---

## Usage

### CLI Commands

| Command | Description |
|---------|-------------|
| `node index.js gui` | Start Web management panel |
| `node index.js start` | Start proxy server (auto-select best mode) |
| `node index.js start -m warp` | Force WARP mode |
| `node index.js start -m proxy` | Force free proxy mode |
| `node index.js start --proxy host:port` | Use specified proxy |
| `node index.js tui` | Start terminal interactive interface |
| `node index.js desktop` | Start Electron desktop app |
| `node index.js up` | One-click start all (proxy + panel + browser) |

### Proxy Management

| Command | Description |
|---------|-------------|
| `node index.js proxy --fetch` | Get free proxy list |
| `node index.js proxy --test [N]` | Test N proxies (default 30) |
| `node index.js proxy --test host:port` | Test specified proxy |
| `node index.js proxy --speed host:port` | Speed test |

### WARP Management

| Command | Description |
|---------|-------------|
| `node index.js warp --register` | First-time registration |
| `node index.js warp --connect` | Connect WARP |
| `node index.js warp --disconnect` | Disconnect WARP |
| `node index.js warp --status` | View status |

### Statistics & Charts

| Command | Description |
|---------|-------------|
| `node index.js stats` | Show ASCII charts |
| `node index.js stats --html` | Generate HTML report (auto-opens browser) |
| `node index.js stats --clear` | Clear history data |

### Other

| Command | Description |
|---------|-------------|
| `node index.js log` | View running logs |
| `node index.js config` | View/edit configuration |
| `node index.js status` | System status overview |

---

## Mode Comparison

| Feature | WARP (Recommended) | Free Proxy |
|---------|-------------------|-----------|
| Stability | High | Medium-low (inherent to free proxies) |
| Speed | Fast | Average |
| Security | High (Cloudflare encryption) | Low (proxy may log traffic) |
| Installation | Requires WARP client | No installation needed |
| Latency | Low | Depends on proxy quality |

---

## Web Management Panel

Feature panels include:

- **Dashboard** — Status overview, WARP/server status, proxy test entry
- **Proxy Management** — Batch testing, real-time progress, manual speed test, result sorting
- **WARP** — Install/connect/disconnect/status monitoring
- **Statistics Charts** — Latency distribution, hourly/daily trends, proxy ranking
- **Local Server** — Start/stop/port settings, upstream proxy config
- **App Proxy** — Add/edit/launch proxy apps (supports presets)

## Tech Stack

- **Runtime**: Node.js
- **Web Server**: Native http module + ws (WebSocket)
- **Proxy Protocols**: SOCKS4/SOCKS5 + HTTP/HTTPS
- **Frontend**: Pure HTML/CSS/JS (no framework dependencies)
- **Charts**: asciichart (terminal) / Chart.js (HTML)
- **TUI**: inquirer + chalk + ora
- **Desktop**: Electron (optional)
- **Browser**: Neutralino.js (optional)

## Project Structure

```
free-proxy-tool/
├── index.js              # CLI entry
├── setup.js              # One-click install script
├── gui/
│   ├── server.js         # HTTP + WebSocket server
│   └── public/
│       └── index.html    # Web management panel
├── lib/
│   ├── proxy-core.js     # Proxy fetch/test core
│   ├── proxy-server.js   # HTTP proxy server
│   ├── stats.js          # Statistics data
│   ├── logger.js         # Logging system
│   ├── utils.js          # Utility functions
│   └── warp.js           # WARP management
├── tui/index.js          # Terminal UI
├── electron/main.js      # Electron desktop app
├── browser/              # Neutralino browser
├── fpt.bat               # Quick launch
└── start-gui.bat         # One-click GUI launch
```

## License

MIT License
