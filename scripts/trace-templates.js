const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');

let inSingle = false;
let inDouble = false;
let inTemplate = false;
let inTmplExpr = 0;
let line = 1;
let col = 1;
let tmplStack = [];

function pos() { return `${line}:${col}`; }

for (let i = 0; i < code.length; i++) {
  const ch = code[i];
  const prev = i > 0 ? code[i-1] : '';
  const next = i < code.length - 1 ? code[i+1] : '';

  if (ch === '\n') { line++; col = 1; continue; }
  if (prev === '\\') { col++; continue; }

  if (inTmplExpr > 0) {
    if (ch === '{') inTmplExpr++;
    else if (ch === '}') inTmplExpr--;
    col++;
    continue;
  }

  if (inTemplate) {
    if (ch === '$' && next === '{') {
      inTmplExpr = 1;
      i++;
      col++;
    } else if (ch === '`') {
      inTemplate = false;
      const start = tmplStack.pop();
      console.log(`Template ended at ${pos()}, started at ${start}`);
    }
    col++;
    continue;
  }

  if (ch === "'" && !inDouble) { inSingle = !inSingle; col++; continue; }
  if (ch === '"' && !inSingle) { inDouble = !inDouble; col++; continue; }

  if (ch === '`' && !inSingle && !inDouble) {
    inTemplate = true;
    tmplStack.push(pos());
    col++;
    continue;
  }

  col++;
}

console.log('\nFinal state:', { inSingle, inDouble, inTemplate, inTmplExpr, openTemplates: tmplStack });
