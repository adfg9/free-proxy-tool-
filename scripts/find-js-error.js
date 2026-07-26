const fs = require('fs');
const html = fs.readFileSync('d:/free-proxy-tool/gui/public/index.html', 'utf8');

function extractScripts(html) {
  const scripts = [];
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf('<script>', i);
    if (start === -1) break;
    const end = html.indexOf('</script>', start);
    if (end === -1) break;
    const code = html.substring(start + 8, end);
    scripts.push({ code, start, end });
    i = end + 9;
  }
  return scripts;
}

const scripts = extractScripts(html);
console.log('Found', scripts.length, 'script blocks');

scripts.forEach((s, idx) => {
  try {
    new Function(s.code);
    console.log('Block', idx + 1, ':', s.code.length, 'chars - OK');
  } catch (e) {
    console.log('Block', idx + 1, ':', s.code.length, 'chars - ERROR:', e.message);
    const lines = s.code.split('\n');
    // 逐行检查找到第一个出错的完整函数
    for (let i = 1; i <= lines.length; i++) {
      const test = lines.slice(0, i).join('\n');
      try { new Function(test); }
      catch (e2) {
        console.log('  First error around line', i);
        for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
          console.log('  ' + (j+1) + ': ' + lines[j].substring(0, 100));
        }
        break;
      }
    }
  }
});
