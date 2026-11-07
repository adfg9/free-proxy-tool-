const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

// 找到 renderProxyTable 函数在 script 块中的开始和结束
const startLine = lines.findIndex(l => l.includes('function _doRenderProxyTable()'));
console.log('Function starts at line', startLine + 1);

// 从 startLine 开始，找到函数结束的位置
let depth = 0;
let foundOpen = false;
let endLine = -1;
for (let i = startLine; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    // 非常简单的括号计数，忽略字符串
    if (ch === '{') { depth++; foundOpen = true; }
    else if (ch === '}') { depth--; if (foundOpen && depth === 0) { endLine = i; break; } }
  }
  if (endLine !== -1) break;
}

console.log('Function ends at line', endLine + 1);

const fnCode = lines.slice(startLine, endLine + 1).join('\n');
console.log('\n--- Function code ---');
console.log(fnCode);
console.log('\n--- Trying to parse ---');

try {
  new Function(fnCode);
  console.log('OK');
} catch(e) {
  console.log('ERROR:', e.message);
}
