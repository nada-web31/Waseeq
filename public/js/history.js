(function () {
  const st = { page: 1, pages: 1 };
  let items = [], openId = null, timer;

  async function load() {
    const p = new URLSearchParams({ page: st.page, limit: 10, q: $('#q').value.trim(), status: $('#status').value });
    try {
      const r = await api('/history?' + p);
      items = r.items; st.pages = r.pages; st.page = r.page; draw();
    } catch (e) { toast(errText(e)); }
  }

  function draw() {
    $('#empty').classList.toggle('hidden', items.length > 0);
    $('#rows').innerHTML = items.map((r) => `<tr class="click" data-id="${r.id}">
      <td class="num">${esc(r.invoice_number || r.file_name || '—')}</td><td>${esc(r.seller_name || '—')}</td>
      <td class="hide-sm num">${fmtNum(r.total)}</td><td class="hide-sm">${esc(t('me.' + r.method))}</td>
      <td>${badge(r.status)}${r.review_status === 'pending' ? ' <span title="' + esc(t('h.review')) + '">⏳</span>' : ''}</td>
      <td class="hide-sm muted">${esc(fmtDate(r.created_at))}</td></tr>`).join('');
    $$('#rows tr').forEach((tr) => { tr.onclick = () => openDetails(tr.dataset.id); });
    $('#pageInfo').textContent = t('h.page', { p: st.page, n: st.pages });
    $('#prev').disabled = st.page <= 1; $('#next').disabled = st.page >= st.pages;
  }

  async function openDetails(id) {
    try {
      const r = await api('/history/' + id);
      openId = id; renderDetails(r); const d = $('#dlg'); if (!d.open) d.showModal();
    } catch (e) { toast(errText(e)); }
  }

  function renderDetails(r) {
    const kv = (k, v, cls) => `<div><span>${esc(k)}</span><b class="${cls || ''}">${esc(v == null || v === '' ? '—' : v)}</b></div>`;
    const file = r.has_file
      ? (r.file_type.startsWith('image/') ? `<img class="file-prev" alt="" src="/api/history/${r.id}/file">` : '') +
        `<p><a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="/api/history/${r.id}/file">${esc(t('h.openFile'))}: ${esc(r.file_name)}</a></p>` : '';
    const review = r.review_status === 'pending'
      ? `<div class="review-box"><b>${esc(t('h.reviewT'))}</b>
          <div class="row2" style="margin-top:10px"><div class="field"><label for="rvStatus">${esc(t('h.reviewStatus'))}</label>
            <select class="input" id="rvStatus"><option value="">${esc(t('h.keep'))}</option>${['valid', 'suspicious', 'invalid'].map((s) => `<option value="${s}">${esc(t('s.' + s))}</option>`).join('')}</select></div>
          <div class="field"><label for="rvNote">${esc(t('h.note'))}</label><input class="input" id="rvNote" maxlength="500"></div></div>
          <button class="btn btn-primary btn-sm" id="rvSave">${esc(t('h.saveReview'))}</button></div>`
      : r.review_status === 'reviewed'
        ? `<div class="review-box"><b>✓ ${esc(t('h.reviewed'))}</b>${r.review_note ? `<p style="margin:6px 0 0">${esc(r.review_note)}</p>` : ''}</div>` : '';
    $('#dlgBody').innerHTML = `<div class="dlg-head"><h3>${esc(t('h.details'))} #${r.id}</h3><button class="x" id="dlgX" aria-label="close">✕</button></div>
      <div class="kv">
        ${kv(t('f.invoiceNumber'), r.invoice_number, 'num')}${kv(t('f.sellerName'), r.seller_name)}
        ${kv(t('f.vatNumber'), r.vat_number, 'num')}${kv(t('f.date'), r.invoice_date, 'num')}
        ${kv(t('f.total'), r.total == null ? '' : fmtNum(r.total), 'num')}${kv(t('f.vatAmount'), r.vat_amount == null ? '' : fmtNum(r.vat_amount), 'num')}
        ${kv(t('h.th.method'), t('me.' + r.method))}${kv(t('h.th.date'), fmtDate(r.created_at))}
      </div>${file}${renderResult(r)}${review}
      <div class="dlg-actions"><button class="btn btn-danger btn-sm" id="delBtn">${esc(t('h.delete'))}</button></div>`;
    $('#dlgX').onclick = closeDlg;
    $('#delBtn').onclick = async () => {
      if (!confirm(t('h.confirm'))) return;
      try { await api('/history/' + r.id, { method: 'DELETE' }); closeDlg(); toast(t('h.deleted')); load(); } catch (e) { toast(errText(e)); }
    };
    const sv = $('#rvSave');
    if (sv) sv.onclick = async () => {
      try {
        await api('/history/' + r.id + '/review', { method: 'PATCH', body: { status: $('#rvStatus').value, note: $('#rvNote').value } });
        toast(t('h.saved')); load(); openDetails(r.id);
      } catch (e) { toast(errText(e)); }
    };
  }
  function closeDlg() { $('#dlg').close(); openId = null; history.replaceState(null, '', '/history.html'); }

  $('#q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => { st.page = 1; load(); }, 250); };
  $('#status').onchange = () => { st.page = 1; load(); };
  $('#prev').onclick = () => { st.page--; load(); };
  $('#next').onclick = () => { st.page++; load(); };
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') closeDlg(); });

  boot('history', {
    auth: true,
    onLang: () => { draw(); if (openId && $('#dlg').open) openDetails(openId); },
  }).then((u) => {
    if (!u) return;
    load();
    const o = new URLSearchParams(location.search).get('open');
    if (o) openDetails(o);
  });
})();
