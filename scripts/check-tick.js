const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');
for (let i = 1165; i <= 1182; i++) {
  const l = lines[i-1];
  let s = '';
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '`') s += '[' + (j+1) + ':`]';
  }
  console.log(i + ': ' + JSON.stringify(l) + '  backticks:' + s);
}
