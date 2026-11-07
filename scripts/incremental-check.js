const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

function scriptCheck(text) {
  try {
    new vm.Script(text);
    return true;
  } catch (e) {
    return e.message;
  }
}

// 用 vm.Script 检查语法，但需要完整脚本。在末尾添加换行和右括号来闭合所有结构不可靠
// 改为：找到第一个使得 vm.Script 报非 "Unexpected end of input" 的位置

let lastError = null;
let lastErrorLine = -1;
for (let i = 1; i <= lines.length; i++) {
  const text = lines.slice(0, i).join('\n');
  const result = scriptCheck(text);
  if (result !== true) {
    if (!result.includes('Unexpected end of input')) {
      lastError = result;
      lastErrorLine = i;
      break;
    }
  }
}

console.log('Last real error at line:', lastErrorLine);
console.log('Error:', lastError);
if (lastErrorLine > 0) {
  for (let i = Math.max(0, lastErrorLine - 10); i < Math.min(lines.length, lastErrorLine + 5); i++) {
    console.log((i+1) + ': ' + lines[i].substring(0, 140));
  }
}
