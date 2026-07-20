const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const stats = require('./stats');

const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
const REPORT_FILE = path.join(CONFIG_DIR, 'stats-report.html');

function openInBrowser(filePath) {
  const cmd = os.platform() === 'win32'
    ? `start "" "${filePath}"`
    : os.platform() === 'darwin'
      ? `open "${filePath}"`
      : `xdg-open "${filePath}"`;
  exec(cmd, () => {}); // ignore errors
}

function generateReport() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  const s = stats.getStats();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Free Proxy Tool - Statistics Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f0f2f5; color: #333; padding: 20px;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  h1 {
    text-align: center; font-size: 24px; color: #1a73e8;
    margin-bottom: 8px; font-weight: 700;
  }
  .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px; margin-bottom: 28px;
  }
  .card {
    background: #fff; border-radius: 10px; padding: 18px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-align: center;
  }
  .card .value { font-size: 28px; font-weight: 700; color: #1a73e8; }
  .card .label { font-size: 12px; color: #888; margin-top: 4px; }
  .chart-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;
  }
  .chart-box {
    background: #fff; border-radius: 10px; padding: 20px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .chart-box.full { grid-column: 1 / -1; }
  .chart-box h2 { font-size: 15px; color: #444; margin-bottom: 14px; font-weight: 600; }
  canvas { width: 100% !important; }
  .proxy-table {
    width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;
  }
  .proxy-table th {
    background: #f5f7fa; padding: 8px 10px; text-align: left;
    border-bottom: 2px solid #e0e0e0; color: #555; font-weight: 600;
  }
  .proxy-table td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  .proxy-table tr:hover td { background: #f9fbff; }
  .tag {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 600;
  }
  .tag-ok { background: #e6f4ea; color: #1e7e34; }
  .tag-warn { background: #fef3e0; color: #b06d00; }
  .no-data { text-align: center; color: #aaa; padding: 40px; font-size: 14px; }
  @media (max-width: 700px) { .chart-row { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">
  <h1>Free Proxy Tool - Statistics Report</h1>
  <p class="subtitle">Generated: ${new Date().toLocaleString()}</p>

  <div class="summary">
    <div class="card"><div class="value">${s.totalTests}</div><div class="label">Total Tests</div></div>
    <div class="card"><div class="value" style="color:#1e7e34">${s.successRate}%</div><div class="label">Success Rate</div></div>
    <div class="card"><div class="value">${s.avgLatency}ms</div><div class="label">Avg Latency</div></div>
    <div class="card"><div class="value">${s.minLatency}ms</div><div class="label">Min Latency</div></div>
    <div class="card"><div class="value">${s.maxLatency}ms</div><div class="label">Max Latency</div></div>
    <div class="card"><div class="value">${s.medianLatency}ms</div><div class="label">Median Latency</div></div>
  </div>

  ${s.totalTests === 0 ? '<div class="no-data">No test data yet, please run proxy test first: node index.js proxy --test</div>' : `
  <div class="chart-row">
    <div class="chart-box">
      <h2>Latency Distribution (ms)</h2>
      <canvas id="bucketChart"></canvas>
    </div>
    <div class="chart-box">
      <h2>Daily Success Rate Trend (%)</h2>
      <canvas id="dailyChart"></canvas>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-box full">
      <h2>24h Latency Trend (ms)</h2>
      <canvas id="hourlyChart" height="80"></canvas>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-box full">
      <h2>Top Proxies - Clustered Comparison (Success Rate % / Avg Latency ms)</h2>
      <canvas id="proxyChart" height="100"></canvas>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-box full">
      <h2>Proxy Details</h2>
      <table class="proxy-table">
        <thead><tr><th>#</th><th>Address</th><th>Type</th><th>Tests</th><th>Success Rate</th><th>Avg Latency</th></tr></thead>
        <tbody>
          ${s.topProxies.map((p, i) => `<tr>
            <td>${i + 1}</td>
            <td><strong>${p.host}:${p.port}</strong></td>
            <td><span class="tag tag-ok">${p.type.toUpperCase()}</span></td>
            <td>${p.tests}</td>
            <td>${p.successRate}%</td>
            <td>${p.avgLatency}ms</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `}

</div>

${s.totalTests > 0 ? `<script>
const COLORS = {
  blue: 'rgba(26,115,232,0.85)', blueBg: 'rgba(26,115,232,0.15)',
  green: 'rgba(30,126,52,0.85)', greenBg: 'rgba(30,126,52,0.15)',
  orange: 'rgba(232,139,26,0.85)', orangeBg: 'rgba(232,139,26,0.15)',
  red: 'rgba(219,68,55,0.85)', redBg: 'rgba(219,68,55,0.15)',
  gray: 'rgba(150,150,150,0.85)'
};
const gridOpts = { color: 'rgba(0,0,0,0.06)' };
const fontOpts = { size: 11, color: '#888' };

// Latency bucket chart
new Chart(document.getElementById('bucketChart'), {
  type: 'bar',
  data: {
    labels: ['0-100ms', '100-300ms', '300-500ms', '500-1000ms', '1000ms+'],
    datasets: [{
      label: 'Test Count',
      data: ${JSON.stringify(s.latencyBuckets)},
      backgroundColor: [COLORS.green, COLORS.blue, COLORS.orange, 'rgba(232,170,26,0.7)', COLORS.red],
      borderRadius: 6, borderSkipped: false
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: fontOpts },
      y: { grid: gridOpts, ticks: fontOpts, beginAtZero: true }
    }
  }
});

// Daily success rate trend
new Chart(document.getElementById('dailyChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(s.dailyDistribution.map(d => d.date))},
    datasets: [{
      label: 'Success Rate %',
      data: ${JSON.stringify(s.dailyDistribution.map(d => d.successRate))},
      borderColor: COLORS.green, backgroundColor: COLORS.greenBg,
      fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.green
    }, {
      label: 'Avg Latency ms',
      data: ${JSON.stringify(s.dailyDistribution.map(d => d.avgLatency))},
      borderColor: COLORS.blue, backgroundColor: COLORS.blueBg,
      fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: COLORS.blue,
      yAxisID: 'y1'
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { labels: { font: fontOpts } } },
    scales: {
      x: { grid: { display: false }, ticks: fontOpts },
      y: { grid: gridOpts, ticks: fontOpts, beginAtZero: true, max: 100, title: { display: true, text: 'Success Rate %', ...fontOpts } },
      y1: { position: 'right', grid: { display: false }, ticks: fontOpts, beginAtZero: true, title: { display: true, text: 'Latency ms', ...fontOpts } }
    }
  }
});

// Hourly latency trend
new Chart(document.getElementById('hourlyChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(s.hourlyDistribution.map(h => String(h.hour).padStart(2, '0') + ':00'))},
    datasets: [{
      label: 'Avg Latency ms',
      data: ${JSON.stringify(s.hourlyDistribution.map(h => h.avgLatency))},
      borderColor: COLORS.blue, backgroundColor: COLORS.blueBg,
      fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: COLORS.blue
    }, {
      label: 'Test Count',
      data: ${JSON.stringify(s.hourlyDistribution.map(h => h.count))},
      borderColor: COLORS.orange, backgroundColor: COLORS.orangeBg,
      fill: false, tension: 0.3, pointRadius: 3, pointBackgroundColor: COLORS.orange,
      yAxisID: 'y1'
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { labels: { font: fontOpts } } },
    scales: {
      x: { grid: gridOpts, ticks: { ...fontOpts, maxRotation: 45 } },
      y: { grid: gridOpts, ticks: fontOpts, beginAtZero: true, title: { display: true, text: 'Latency ms', ...fontOpts } },
      y1: { position: 'right', grid: { display: false }, ticks: fontOpts, beginAtZero: true, title: { display: true, text: 'Tests', ...fontOpts } }
    }
  }
});

// Proxy clustered bar chart
new Chart(document.getElementById('proxyChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(s.topProxies.map(p => p.host + ':' + p.port))},
    datasets: [{
      label: 'Success Rate %',
      data: ${JSON.stringify(s.topProxies.map(p => p.successRate))},
      backgroundColor: COLORS.green, borderRadius: 4
    }, {
      label: 'Avg Latency ms',
      data: ${JSON.stringify(s.topProxies.map(p => p.avgLatency))},
      backgroundColor: COLORS.blue, borderRadius: 4
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { labels: { font: fontOpts } } },
    scales: {
      x: { grid: { display: false }, ticks: { ...fontOpts, maxRotation: 45 } },
      y: { grid: gridOpts, ticks: fontOpts, beginAtZero: true }
    }
  }
});
</script>` : ''}
</body>
</html>`;

  fs.writeFileSync(REPORT_FILE, html);
  openInBrowser(REPORT_FILE);
  return REPORT_FILE;
}

module.exports = { generateReport };
