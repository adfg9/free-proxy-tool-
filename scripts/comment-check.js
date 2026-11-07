const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

function canParse(text) {
  try { new Function(text); return true; } catch { return false; }
}

// 二分查找：注释掉后半部分，看哪一半导致错误
function findBadLine() {
  let lo = 1, hi = lines.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const test = lines.slice(0, mid).join('\n') + '\n/* end */';
    if (canParse(test)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const badLine = findBadLine();
console.log('Bad line region:', badLine);
for (let i = Math.max(0, badLine - 10); i < Math.min(lines.length, badLine + 5); i++) {
  console.log((i+1) + ': ' + lines[i].substring(0, 140));
}
