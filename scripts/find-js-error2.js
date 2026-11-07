const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
const code = html.substring(start, end);

try {
  new vm.Script(code, { filename: 'index.html' });
  console.log('OK');
} catch (e) {
  console.log('Error:', e.message);
  console.log('Line:', e.lineNumber);
  console.log('Stack:', e.stack);
  const lines = code.split('\n');
  const ln = e.lineNumber;
  if (ln && lines[ln-1]) {
    console.log('\nContext:');
    for (let i = Math.max(0, ln - 5); i < Math.min(lines.length, ln + 5); i++) {
      console.log((i+1) + ': ' + lines[i].substring(0, 120));
    }
  }
}
