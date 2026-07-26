const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

function canParse(text) {
  try { new Function(text); return true; } catch { return false; }
}

// 二分查找：在 lines 中找到最小的 i，使 lines[0..i-1] 不能被解析
// 但需要代码结构完整，所以不能简单截断
// 改为：找到包含错误的最小区块

// 从第 1 行开始，每次增加 100 行，直到失败
let lastGood = 0;
for (let i = 100; i <= lines.length; i += 100) {
  const test = lines.slice(0, i).join('\n');
  if (canParse(test)) {
    lastGood = i;
  } else {
    // 在 i-100 和 i 之间精确查找
    for (let j = i - 100 + 1; j <= i; j++) {
      const test2 = lines.slice(0, j).join('\n');
      if (!canParse(test2)) {
        console.log('Parse fails when adding line', j);
        for (let k = Math.max(0, j - 15); k < Math.min(lines.length, j + 5); k++) {
          console.log((k+1) + ': ' + lines[k].substring(0, 120));
        }
        return;
      }
    }
  }
}
console.log('All lines parse OK? Last good:', lastGood);
