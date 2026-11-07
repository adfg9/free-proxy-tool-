const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
let code = html.substring(start, end);

// 逐行移除，看移除哪些行后错误消失
const lines = code.split('\n');

// 从第 484 行开始往前找，找到第一个让代码 "变对" 的位置
// 实际上更好的方法：从 484 行往回找，看哪一行的问题
// 让我们把第 484 行前后包在一个 try 里

// 另一种方法：找出从第 1 行到第 N 行中，最大的 N 使前 N 行可以被解析
function canParse(text) {
  try { new Function(text); return true; } catch { return false; }
}

// 因为模板字符串可能跨越多行，累积到完整闭合才能通过
// 我们从后往前删：从最后一行往前删，找到第一个能解析的位置
let lo = 0, hi = lines.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  const test = lines.slice(0, mid).join('\n');
  if (canParse(test)) lo = mid + 1;
  else hi = mid;
}

console.log('First line that causes parse failure (cumulative):', lo);
console.log('\nLines around it:');
for (let i = Math.max(0, lo - 10); i < Math.min(lines.length, lo + 5); i++) {
  console.log((i+1) + ': ' + lines[i].substring(0, 140));
}
