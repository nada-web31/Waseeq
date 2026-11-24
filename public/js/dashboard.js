(function () {
  const COL = { valid: '#0FA67A', suspicious: '#E8940C', invalid: '#E5484D', pending: '#6C47FF' };
  const KEYS = ['valid', 'suspicious', 'invalid', 'pending'];
  const hidden = new Set();
  let data = null;
  const tip = document.createElement('div');
  tip.className = 'tip hidden'; document.body.appendChild(tip);
  const showTip = (e, html) => { tip.innerHTML = html; tip.classList.remove('hidden'); tip.style.left = Math.min(e.clientX + 14, innerWidth - 180) + 'px'; tip.style.top = e.clientY + 14 + 'px'; };
  const hideTip = () => tip.classList.add('hidden');

  function donut() {
    const counts = { valid: data.totals.valid, suspicious: data.totals.suspicious, invalid: data.totals.invalid, pending: data.totals.pending_status };
    const vis = KEYS.filter((k) => !hidden.has(k) && counts[k] > 0);
    const sum = vis.reduce((a, k) => a + counts[k], 0), R = 70, C = 2 * Math.PI * R;
    let off = 0;
    const segs = vis.map((k) => {
      const len = C * counts[k] / sum, s = `<circle class="seg" data-k="${k}" cx="100" cy="100" r="${R}" fill="none" stroke="${COL[k]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"/>`;
      off += len; return s;
    }).join('');
    $('#donut').innerHTML = `<svg class="donut" viewBox="0 0 200 200" role="img">
      <circle cx="100" cy="100" r="${R}" fill="none" stroke="#E6E0FF" stroke-width="22"/>${segs}
      <text id="dc1" x="100" y="102" text-anchor="middle" font-size="30" font-weight="800" fill="#16134A">${sum ? fmtInt(sum) : '0'}</text>
      <text id="dc2" x="100" y="124" text-anchor="middle" font-size="12" fill="#6B6890">${sum ? t('d.total') : t('d.none')}</text></svg>`;
    $$('#donut .seg').forEach((c) => {
      c.onmousemove = (e) => { const k = c.dataset.k; showTip(e, `${t('s.' + k)}: ${fmtInt(counts[k])}`); $('#dc1').textContent = fmtInt(counts[k]); $('#dc2').textContent = t('s.' + k); };
      c.onmouseleave = () => { hideTip(); $('#dc1').textContent = fmtInt(sum); $('#dc2').textContent = t('d.total'); };
    });
    $('#legend').innerHTML = KEYS.map((k) => `<button data-k="${k}" class="${hidden.has(k) ? 'off' : ''}"><i style="background:${COL[k]}"></i>${esc(t('s.' + k))} <span class="num muted">${fmtInt(counts[k])}</span></button>`).join('');
    $$('#legend button').forEach((b) => { b.onclick = () => { hidden.has(b.dataset.k) ? hidden.delete(b.dataset.k) : hidden.add(b.dataset.k); donut(); bars(); }; });
  }

  function bars() {
    const W = 560, H = 230, L = 30, B = 26, T = 10, n = data.daily.length;
    const vis = KEYS.filter((k) => !hidden.has(k));
    const max = Math.max(4, ...data.daily.map((d) => vis.reduce((a, k) => a + d[k], 0)));
    const step = Math.ceil(max / 4), top = step * 4, bw = (W - L) / n, ph = H - B - T;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = T + ph - (ph * i * step) / top;
      g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="#E6E0FF"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="#6B6890" text-anchor="end">${i * step}</text>`;
    }
    const rtl = LANG === 'ar';
    data.daily.forEach((d, i) => {
      const idx = rtl ? n - 1 - i : i, x = L + idx * bw + bw * 0.18, w = bw * 0.64;
      let y = T + ph;
      const tipHtml = `<b>${d.date}</b><br>` + vis.map((k) => `${t('s.' + k)}: ${d[k]}`).join('<br>');
      vis.forEach((k) => {
        if (!d[k]) return;
        const h = (ph * d[k]) / top; y -= h;
        g += `<rect class="bar" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${COL[k]}" data-tip="${esc(tipHtml)}"/>`;
      });
      if (i % 2 === 0 || n < 8) {
        const lab = new Date(d.date + 'T00:00:00Z').toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
        g += `<text x="${x + w / 2}" y="${H - 8}" font-size="10" fill="#6B6890" text-anchor="middle">${esc(lab)}</text>`;
      }
      g += `<rect x="${L + idx * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${esc(tipHtml)}"/>`;
    });
    $('#bars').innerHTML = `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg>`;
    $$('#bars [data-tip]').forEach((r) => {
      r.onmousemove = (e) => showTip(e, r.dataset.tip); r.onmouseleave = hideTip;
      r.onclick = (e) => showTip(e, r.dataset.tip);
    });
  }

  function methods() {
    const m = data.methods, max = Math.max(1, m.upload, m.qr, m.manual);
    $('#methods').innerHTML = ['upload', 'qr', 'manual'].map((k) =>
      `<div class="mrow"><span>${esc(t('me.' + k))}</span><div class="track"><i style="width:${(m[k] / max) * 100}%"></i></div><b class="num">${fmtInt(m[k])}</b></div>`).join('');
  }

  function recent() {
    $('#recentEmpty').classList.toggle('hidden', data.recent.length > 0);
    $('#recent').innerHTML = data.recent.map((r) => `<tr class="click" data-id="${r.id}">
      <td class="num">${esc(r.invoice_number || '—')}</td><td class="hide-sm">${esc(r.seller_name || '—')}</td>
      <td>${badge(r.status)}</td><td class="hide-sm muted">${esc(fmtDate(r.created_at))}</td></tr>`).join('');
    $$('#recent tr').forEach((tr) => { tr.onclick = () => { location.href = '/history.html?open=' + tr.dataset.id; }; });
  }

  function render() {
    if (!data) return;
    $('#sTotal').textContent = fmtInt(data.totals.total);
    $('#sValid').textContent = fmtInt(data.totals.valid);
    $('#sSusp').textContent = fmtInt(data.totals.suspicious);
    $('#sPend').textContent = fmtInt(data.totals.pending);
    donut(); bars(); methods(); recent();
  }

  boot('dashboard', { auth: true, onLang: render }).then(async (u) => {
    if (!u) return;
    try { data = await api('/stats'); render(); } catch (e) { toast(errText(e)); }
  });
})();
