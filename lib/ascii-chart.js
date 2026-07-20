const asciichart = require('asciichart');
const stats = require('./stats');

function printTitle(title) {
  console.log('');
  console.log(`  ─── ${title} ───`);
}

function printLatencyTrend() {
  printTitle('Latency Trend (ms)');
  const s = stats.getStats();
  if (s.totalTests === 0) {
    console.log('  No data');
    return;
  }
  const data = s.hourlyDistribution.map(h => h.avgLatency);
  if (data.every(v => v === 0)) {
    console.log('  No data');
    return;
  }
  // Print hour labels on left
  const labels = s.hourlyDistribution.map(h => `${String(h.hour).padStart(2, '0')}:00`);
  console.log(`  ${labels[0]} ${'-'.repeat(50)} ${labels[labels.length - 1]}`);
  console.log(asciichart.plot(data, {
    height: 12,
    format: function (x) { return ('    ' + x.toFixed(0)).slice(-5) + ' │'; }
  }));
}

function printLatencyBuckets() {
  printTitle('Latency Distribution');
  const s = stats.getStats();
  if (s.totalTests === 0) {
    console.log('  No data');
    return;
  }
  const labels = ['  0-100ms ', '100-300ms ', '300-500ms ', '500-1000ms', '  1000ms+ '];
  const maxVal = Math.max(...s.latencyBuckets, 1);
  const barWidth = 40;

  for (let i = 0; i < labels.length; i++) {
    const count = s.latencyBuckets[i];
    const barLen = Math.round((count / maxVal) * barWidth);
    const bar = '█'.repeat(barLen);
    console.log(`  ${labels[i]} │${bar} ${count}`);
  }
}

function printDailyTrend() {
  printTitle('Daily Success Rate Trend (%)');
  const s = stats.getStats();
  if (s.totalTests === 0) {
    console.log('  No data');
    return;
  }
  const data = s.dailyDistribution.map(d => d.successRate);
  if (data.every(v => v === 0)) {
    console.log('  No data');
    return;
  }
  const labels = s.dailyDistribution.map(d => d.date);
  console.log(`  ${labels[0]} ${'-'.repeat(50)} ${labels[labels.length - 1]}`);
  console.log(asciichart.plot(data, {
    height: 10,
    min: 0,
    max: 100,
    format: function (x) { return ('    ' + x.toFixed(0)).slice(-5) + '% │'; }
  }));
}

function printTopProxiesBar() {
  printTitle('Top Proxies');
  const s = stats.getStats();
  if (s.totalTests === 0 || s.topProxies.length === 0) {
    console.log('  No data');
    return;
  }
  const maxRate = Math.max(...s.topProxies.map(p => p.successRate), 1);
  const barWidth = 30;

  s.topProxies.forEach((p, i) => {
    const barLen = Math.round((p.successRate / maxRate) * barWidth);
    const bar = '█'.repeat(barLen);
    console.log(`  ${(i + 1 + '.').padStart(3)} ${p.host}:${String(p.port).padEnd(5)} │${bar} ${p.successRate}% (${p.avgLatency}ms)`);
  });
}

function printAllCharts() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║       Free Proxy Tool - Statistics Charts      ║');
  console.log('  ╚═══════════════════════════════════════╝');
  printLatencyBuckets();
  printLatencyTrend();
  printDailyTrend();
  printTopProxiesBar();
  console.log('');
}

module.exports = { printLatencyTrend, printLatencyBuckets, printDailyTrend, printTopProxiesBar, printAllCharts };
