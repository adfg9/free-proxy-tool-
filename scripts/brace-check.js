const fs = require('fs');
const code = fs.readFileSync('d:/free-proxy-tool/scripts/test-block.js', 'utf8');
const lines = code.split('\n');

// 用括号平衡检查：从第 1 行到第 N 行，如果括号是平衡的，说明那之前是完整的
let braceDepth = 0;
let parenDepth = 0;
let bracketDepth = 0;
let inTemplate = 0;
let inSingle = false;
let inDouble = false;
let lastBalancedLine = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    
    if (inTemplate > 0) {
      if (ch === '$' && j+1 < line.length && line[j+1] === '{') {
        inTemplate++;
        j++;
        continue;
      }
      if (ch === '`') {
        inTemplate--;
        continue;
      }
      continue;
    }
    
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = 1; continue; }
    
    if (inSingle || inDouble) continue;
    
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
  }
  
  if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && inTemplate === 0 && !inSingle && !inDouble) {
    lastBalancedLine = i + 1;
  }
}

console.log('Last fully balanced line:', lastBalancedLine);
console.log('Total lines:', lines.length);

if (lastBalancedLine < lines.length) {
  console.log('\nLines after last balanced point:');
  for (let i = Math.max(0, lastBalancedLine); i < Math.min(lines.length, lastBalancedLine + 30); i++) {
    console.log((i+1) + ': ' + lines[i].substring(0, 120));
  }
}

// 也检查在第 484 行附近的括号深度
braceDepth = 0;
parenDepth = 0;
inTemplate = 0;
inSingle = false;
inDouble = false;

for (let i = 450; i < 510; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    
    if (inTemplate > 0) {
      if (ch === '$' && j+1 < line.length && line[j+1] === '{') { inTemplate++; j++; continue; }
      if (ch === '`') { inTemplate--; continue; }
      continue;
    }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = 1; continue; }
    if (inSingle || inDouble) continue;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
  }
  if (i >= 475 && i <= 505) {
    console.log(`Line ${i+1}: brace=${braceDepth} paren=${parenDepth} tmpl=${inTemplate} | ${line.substring(0, 60)}`);
  }
}
