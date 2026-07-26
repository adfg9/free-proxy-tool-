const fs = require('fs');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
let code = html.substring(start, end);
const lines = code.split('\n');

// 从 _doRenderProxyTable 函数开头（第 454 行附近）开始计数反引号
// 跟踪模板字符串状态
let inTemplate = false;
let inSingle = false;
let inDouble = false;
let templateStart = -1;

for (let i = 453; i < 510; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) {
      inTemplate = !inTemplate;
      if (inTemplate) {
        templateStart = i + 1;
        console.log(`Line ${i+1}, col ${j+1}: template START`);
      } else {
        console.log(`Line ${i+1}, col ${j+1}: template END (started at line ${templateStart})`);
        templateStart = -1;
      }
    }
  }
}

console.log('\nAt end of check, inTemplate:', inTemplate);

// 也看看第 482 行 "return `" 后面
console.log('\nLine 482:', lines[481]);
console.log('Line 500:', lines[499]);
console.log('Line 505:', lines[504]);
