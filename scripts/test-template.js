const fs = require('fs');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
let code = html.substring(start, end);
const lines = code.split('\n');

// 用栈来跟踪嵌套的模板字符串
let templateStack = [];
let inSingle = false;
let inDouble = false;

function findMatchingBrace(s, startIdx, openCh, closeCh) {
  let depth = 1;
  for (let i = startIdx; i < s.length; i++) {
    if (s[i] === openCh) depth++;
    else if (s[i] === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 从第 480 行开始逐字符分析
let i = 470;
let startLine = i;
let codeFromLine = lines.slice(i).join('\n');
let pos = 0;

// 更简单的方法：用 vm 的错误行号，然后检查那一行前后的上下文
// vm.Script 报错第 484 行
// 让我从第 1 行到第 483 行的代码，看看是否能解析
const codeTo483 = lines.slice(0, 483).join('\n');
try {
  new Function(codeTo483 + '\n}');  // 尝试补一个闭合看看
  console.log('Code to line 483 + } is OK');
} catch(e) {
  console.log('Code to line 483 + } error:', e.message);
}

// 看看第 476-484 行在函数体里是否正常
// 问题可能是：`filtered.map((p, i) => { return \`...` 的反引号嵌套有问题
// 让我单独提取这段代码测试
const testFn = `
function test() {
  const filtered = [{host:'1',port:2,type:'socks5',latency:100,tests:5,source:'x',builtin:false}];
  const tbody = { innerHTML: '' };
  tbody.innerHTML = filtered.map((p, i) => {
    const grade = 'A';
    const latencyColor = 'red';
    const latencyPct = 50;
    return \`
      <tr>
        <td><span class="sp-grade sp-grade-\${grade}">\${grade}</span></td>
        <td class="mono">\${p.host}\${p.builtin ? '<span class="sp-builtin-tag">TAG</span>' : ''}</td>
        <td>\${p.port}</td>
        <td><span class="badge badge-ok" style="font-size:10px;">\${(p.type || 'socks5').toUpperCase()}</span></td>
        <td>
          <span style="color:\${latencyColor};font-weight:600;">\${p.latency > 0 ? p.latency + 'ms' : 'N/A'}</span>
          <span class="sp-latency-bar"><span class="sp-latency-bar-fill" style="width:\${latencyPct}%;background:\${latencyColor};"></span></span>
        </td>
        <td>\${p.tests || 0}</td>
        <td class="text-muted text-sm">\${p.source || 'Unknown'}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-outline btn-sm">Test</button>
            <button class="btn btn-outline btn-sm">Launch</button>
            \${!p.builtin ? \`<button class="btn btn-danger btn-sm">🗑</button>\` : ''}
          </div>
        </td>
      </tr>
    \`;
  }).join('');
}
test();
`;

try {
  new Function(testFn);
  console.log('Test template string with nested template: OK');
} catch(e) {
  console.log('Test template error:', e.message);
}
