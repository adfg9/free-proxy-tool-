const fs = require('fs');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
let code = html.substring(start, end);

// 从错误行 484 往前找未闭合的模板字符串
const lines = code.split('\n');
let inTemplate = false;
let templateStartLine = -1;

for (let i = 0; i < 490; i++) {
  const line = lines[i];
  // 简单检查反引号（忽略字符串内的）
  let inSingle = false;
  let inDouble = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) {
      inTemplate = !inTemplate;
      if (inTemplate) templateStartLine = i + 1;
      else templateStartLine = -1;
    }
  }
}

console.log('At line 490, inTemplate:', inTemplate, 'started at line:', templateStartLine);

if (templateStartLine > 0) {
  console.log('\nTemplate string content from line', templateStartLine, ':');
  for (let i = templateStartLine - 1; i < Math.min(lines.length, templateStartLine + 10); i++) {
    console.log((i+1) + ': ' + lines[i].substring(0, 120));
  }
}

// 也检查在 484 行之前是否有不正常的地方
// 尝试按函数解析
console.log('\n--- Checking function boundaries around line 450-520 ---');
for (let i = 445; i < 520; i++) {
  const line = lines[i];
  if (line.includes('function ') || line.includes('function(')) {
    console.log((i+1) + ': FUNC - ' + line.trim().substring(0, 80));
  }
}
