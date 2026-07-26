const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

function canParse(text) {
  try { new Function(text); return true; } catch(e) { return e.message; }
}

// 分两半检查
const mid = Math.floor(lines.length / 2);
const firstHalf = lines.slice(0, mid).join('\n') + '\n}';
const secondHalf = 'function test() {\n' + lines.slice(mid).join('\n');

console.log('First half (1-' + mid + ') error:', canParse(firstHalf));
console.log('Second half (' + mid + '-' + lines.length + ') error:', canParse(secondHalf));

// 更细粒度：从中间开始向前/向后找
let firstBad = -1;
for (let i = 1; i <= lines.length; i++) {
  const test = lines.slice(0, i).join('\n');
  try { new Function(test); }
  catch(e) {
    // 只有当错误不是 "Unexpected end of input" 时，才是真错误
    if (!e.message.includes('Unexpected end of input')) {
      firstBad = i;
      break;
    }
  }
}

console.log('\nFirst non-end-of-input error at line:', firstBad);
if (firstBad > 0) {
  for (let i = Math.max(0, firstBad - 10); i < Math.min(lines.length, firstBad + 5); i++) {
    console.log((i+1) + ': ' + lines[i].substring(0, 140));
  }
}
