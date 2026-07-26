const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

// 找到 _doRenderProxyTable 函数在 script 块中的开始和结束
const startLine = lines.findIndex(l => l.includes('function _doRenderProxyTable()'));
console.log('Function starts at line', startLine + 1);

// 正确跟踪字符串和模板，找函数结束
let depth = 0;
let foundOpen = false;
let endLine = -1;
let inSingle = false;
let inDouble = false;
let inTemplate = false;

for (let i = startLine; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    
    if (inTemplate) {
      if (ch === '$' && j+1 < line.length && line[j+1] === '{') {
        depth++;
        j++;
      } else if (ch === '`') {
        inTemplate = false;
      }
      continue;
    }
    
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = true; continue; }
    if (inSingle || inDouble) continue;
    
    if (ch === '{' || ch === '(' || ch === '[') {
      if (ch === '{') { depth++; foundOpen = true; }
    } else if (ch === '}' || ch === ')' || ch === ']') {
      if (ch === '}') depth--;
      if (foundOpen && depth === 0) { endLine = i; break; }
    }
  }
  if (endLine !== -1) break;
}

console.log('Function ends at line', endLine + 1);

const fnCode = lines.slice(startLine, endLine + 1).join('\n');
console.log('\n--- Function code (lines ' + (startLine+1) + '-' + (endLine+1) + ') ---');
console.log(fnCode);
console.log('\n--- Trying to parse ---');

try {
  new Function(fnCode);
  console.log('OK');
} catch(e) {
  console.log('ERROR:', e.message);
}
