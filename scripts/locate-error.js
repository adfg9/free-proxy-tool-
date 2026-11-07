const fs = require('fs');
const { execSync } = require('child_process');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

function check(text) {
  fs.writeFileSync('d:/free-proxy-tool/scripts/check-temp.js', text);
  try {
    execSync('node --check d:/free-proxy-tool/scripts/check-temp.js', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// 从文件末尾开始，逐步减少行数，找到最后一个能通过的版本
// 但每次都需要保证结构完整（用 try { ... 包裹）
// 方法：在末尾添加 '}' 来闭合所有可能的未闭合结构

let lo = 1, hi = lines.length;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  const test = lines.slice(0, mid).join('\n') + '\n}'.repeat(50);
  if (check(test)) {
    lo = mid + 1;
  } else {
    hi = mid - 1;
  }
}

console.log('Last good with closing braces:', hi);
console.log('Next line is:', hi + 1);
for (let i = Math.max(0, hi - 5); i < Math.min(lines.length, hi + 10); i++) {
  console.log((i+1) + ': ' + lines[i].substring(0, 140));
}
