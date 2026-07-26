const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');

let inSingle = false;
let inDouble = false;
let inTemplate = 0;
let inTemplateExpr = 0;
let line = 1;
let col = 1;
let templateStartLine = -1;
let templateStartCol = -1;
let lastTemplateStartLine = -1;

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

  if (inTemplateExpr > 0) {
    if (ch === '{') inTemplateExpr++;
    else if (ch === '}') inTemplateExpr--;
    col++;
    continue;
  }

  if (inTemplate > 0) {
    if (ch === '$' && next === '{') {
      inTemplateExpr = 1;
      i++;
      col++;
    } else if (ch === '`') {
      inTemplate--;
      if (inTemplate === 0) {
        templateStartLine = -1;
      }
    }
    col++;
    continue;
  }

  if (ch === "'" && !inDouble) { inSingle = !inSingle; col++; continue; }
  if (ch === '"' && !inSingle) { inDouble = !inDouble; col++; continue; }

  if (ch === '`' && !inSingle && !inDouble) {
    inTemplate = 1;
    templateStartLine = line;
    templateStartCol = col;
    lastTemplateStartLine = line;
    col++;
    continue;
  }

  col++;
}

console.log('Last template string started at line', lastTemplateStartLine);
console.log('Currently open template started at line', templateStartLine, 'col', templateStartCol);

// 显示最后 50 行
const lines = code.split('\n');
console.log('\nLast 60 lines:');
for (let i = Math.max(0, lines.length - 60); i < lines.length; i++) {
  console.log((i+1) + ': ' + lines[i].substring(0, 140));
}
