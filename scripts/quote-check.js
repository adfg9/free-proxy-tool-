const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');

// 检查是否有未闭合的字符串导致解析器状态错乱
// 用状态机跟踪每一行的字符串状态
let inSingle = false;
let inDouble = false;
let inTemplate = 0;
let inTemplateExpr = 0; // ${ 嵌套深度
let line = 1;
let col = 1;

function logPos(msg, ch) {
  console.log(`${msg} at line ${line}, col ${col}: '${ch}'`);
}

for (let i = 0; i < code.length; i++) {
  const ch = code[i];
  const prev = i > 0 ? code[i-1] : '';
  const next = i < code.length - 1 ? code[i+1] : '';

  if (ch === '\n') {
    line++;
    col = 1;
    continue;
  }

  if (prev === '\\') {
    col++;
    continue;
  }

  // 在模板字符串表达式内
  if (inTemplateExpr > 0) {
    if (ch === '{') inTemplateExpr++;
    else if (ch === '}') inTemplateExpr--;
    col++;
    continue;
  }

  // 在模板字符串内
  if (inTemplate > 0) {
    if (ch === '$' && next === '{') {
      inTemplateExpr = 1;
      i++; // 跳过 {
      col++;
    } else if (ch === '`') {
      inTemplate--;
    }
    col++;
    continue;
  }

  if (ch === "'" && !inDouble) {
    inSingle = !inSingle;
    col++;
    continue;
  }

  if (ch === '"' && !inSingle) {
    inDouble = !inDouble;
    col++;
    continue;
  }

  if (ch === '`' && !inSingle && !inDouble) {
    inTemplate = 1;
    col++;
    continue;
  }

  col++;
}

console.log('Final state:', { inSingle, inDouble, inTemplate, inTemplateExpr });
if (inSingle || inDouble || inTemplate > 0) {
  console.log('ERROR: Unclosed string/template at end of file');
}
