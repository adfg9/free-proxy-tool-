function renderProxyTable() {
  if (_proxyTableTimer) clearTimeout(_proxyTableTimer);
  _proxyTableTimer = setTimeout(() => _doRenderProxyTable(), 50);
}
function _doRenderProxyTable() {
  const tbody = document.getElementById('proxyTableBody');
  const filter = document.getElementById('proxyFilter').value.toLowerCase();
  let filtered = allProxies.filter(p => {
    if (currentFilter !== 'all' && (p.type || '').toLowerCase() !== currentFilter) return false;
    if (filter && !p.host.toLowerCase().includes(filter) && !(p.ip || '').toLowerCase().includes(filter)) return false;
    return true;
  });

  if (currentSort === 'latency') {
    filtered.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
  } else if (currentSort === 'tests') {
    filtered.sort((a, b) => (b.tests || 0) - (a.tests || 0));
  } else if (currentSort === 'host') {
    filtered.sort((a, b) => a.host.localeCompare(b.host));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><span data-i18n="noProxiesFound">No proxies found</span></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((p, i) => {
    const grade = getGrade(p.latency);
    const latencyColor = p.latency > 0 && p.latency < 300 ? 'var(--success)' :
                         p.latency > 0 && p.latency < 600 ? 'var(--warning)' :
                         p.latency > 0 ? 'var(--danger)' : 'var(--text2)';
    const latencyPct = p.latency > 0 ? Math.min(100, (1000 - p.latency) / 10) : 0;
    return `
      <tr>
        <td><span class="sp-grade sp-grade-${grade}">${grade}</span></td>
        <td class="mono">${p.host}${p.builtin ? '<span class="sp-builtin-tag">' + _t('builtInTag') + '</span>' : ''}</td>
        <td>${p.port}</td>
        <td><span class="badge badge-ok" style="font-size:10px;">${(p.type || 'socks5').toUpperCase()}</span></td>
        <td>
          <span style="color:${latencyColor};font-weight:600;">${p.latency > 0 ? p.latency + 'ms' : _t('noData')}</span>
          <span class="sp-latency-bar"><span class="sp-latency-bar-fill" style="width:${latencyPct}%;background:${latencyColor};"></span></span>
        </td>
        <td>${p.tests || 0}</td>
        <td class="text-muted text-sm">${p.source || _t('unknown')}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-outline btn-sm" onclick="testOneProxy('${p.host}', ${p.port}, '${p.type || 'socks5'}')">🧪 ${_t('testBtn')}</button>
            <button class="btn btn-outline btn-sm" onclick="launchAppWithProxy('${p.host}', ${p.port}, '${p.type || 'socks5'}')">🚀 ${_t('launchBtn')}</button>
            ${!p.builtin ? `<button class="btn btn-danger btn-sm" onclick="removeProxy('${p.host}', ${p.port})">🗑</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
}
