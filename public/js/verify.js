(function () {
  let lastRec = null, file = null, qrRaw = '', stream = null, timer = null, detector, jsqrLoading = null;
  const MAX = 8 * 1024 * 1024;

  /* ---------- helpers ---------- */
  const tlvDecode = (b64) => {
    try {
      const bin = atob(b64.replace(/\s/g, '')), b = Uint8Array.from(bin, (c) => c.charCodeAt(0)), out = {};
      for (let i = 0; i < b.length;) { const tag = b[i], len = b[i + 1]; if (i + 2 + len > b.length) return null; out[tag] = new TextDecoder().decode(b.slice(i + 2, i + 2 + len)); i += 2 + len; }
      return out[1] && out[2] ? out : null;
    } catch (e) { return null; }
  };
  const tlvEncode = (vals) => {
    const bytes = [];
    vals.forEach((v, i) => { const e = new TextEncoder().encode(String(v)); bytes.push(i + 1, e.length, ...e); });
    return btoa(String.fromCharCode(...bytes));
  };
  const msg = (text, cls) => { $('#formMsg').innerHTML = text ? `<div class="msg ${cls || 'err'}">${esc(text)}</div>` : ''; };
  const val = (id) => $(id).value.trim();

  function showResult(rec) {
    lastRec = rec;
    $('#result').innerHTML = renderResult(rec) + `<div class="result-actions">
      <a class="btn btn-primary btn-sm" href="/history.html?open=${rec.id}">${esc(t('r.view'))}</a>
      <button class="btn btn-light btn-sm" id="again">${esc(t('r.again'))}</button></div>`;
    $('#again').onclick = () => { lastRec = null; $('#result').innerHTML = `<div class="empty-res">${esc(t('r.empty'))}</div>`; window.scrollTo({ top: 0, behavior: 'smooth' }); };
    if (window.innerWidth < 960) $('#result').scrollIntoView({ behavior: 'smooth' });
  }

  async function send(path, body, btn) {
    msg('');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = t('v.checking');
    try { showResult(await api('/verify/' + path, { method: 'POST', body })); }
    catch (e) { msg(errText(e)); }
    btn.disabled = false; btn.textContent = label;
  }

  /* ---------- tabs ---------- */
  function setMethod(m) {
    if (!['upload', 'qr', 'manual'].includes(m)) m = 'upload';
    $$('.mtab').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    ['upload', 'qr', 'manual'].forEach((k) => $('#pane-' + k).classList.toggle('hidden', k !== m));
    if (m !== 'qr') stopCam();
    msg('');
  }
  $$('.mtab').forEach((b) => { b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.m); setMethod(b.dataset.m); }; });

  /* ---------- QR engine (BarcodeDetector, falling back to jsQR from CDN) ---------- */
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(true);
    if (!jsqrLoading) jsqrLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      s.onload = () => res(true); s.onerror = () => { jsqrLoading = null; res(false); };
      document.head.appendChild(s);
    });
    return jsqrLoading;
  }
  async function initEngine() {
    if (detector === undefined) {
      detector = null;
      if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
    }
    if (!detector) return loadJsQR();
    return true;
  }
  async function detect(source, canvas) {
    if (detector) { try { const r = await detector.detect(source); if (r.length) return r[0].rawValue; } catch (e) { /* fall through */ } }
    if (window.jsQR && canvas) {
      const c = canvas.getContext('2d', { willReadFrequently: true }), d = c.getImageData(0, 0, canvas.width, canvas.height);
      const r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
      if (r) return r.data;
    }
    return null;
  }

  /* ---------- Upload ---------- */
  function fileKind(f) {
    const n = f.name.toLowerCase();
    if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (f.type === 'image/png' || n.endsWith('.png')) return 'img';
    if (f.type === 'image/jpeg' || /\.jpe?g$/.test(n)) return 'img';
    return null;
  }
  async function chooseFile(f) {
    msg(''); $('#upNote').textContent = ''; qrRaw = ''; file = null; $('#filePrev').innerHTML = '';
    if (!f) return;
    const kind = fileKind(f);
    if (!kind) return msg(t('v.fileBadType'));
    if (f.size > MAX) return msg(t('v.fileBig'));
    file = f;
    const thumb = kind === 'img' ? `<img alt="" src="${URL.createObjectURL(f)}">` : '<span class="ico">PDF</span>';
    $('#filePrev').innerHTML = `<div class="preview">${thumb}<div><b>${esc(f.name)}</b><br><small class="muted num">${(f.size / 1024).toFixed(0)} KB</small></div></div>`;
    if (kind === 'pdf') { $('#upNote').textContent = t('v.pdfNote'); return; }
    try {
      await initEngine();
      const bmp = await createImageBitmap(f);
      for (const maxSide of [1600, 900]) {
        const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const r = await detect(cv, cv);
        if (r) { qrRaw = r; break; }
      }
    } catch (e) { /* ignore decode errors */ }
    $('#upNote').textContent = qrRaw ? '✓ ' + t('v.qrAuto') : t('v.qrNoneImg');
  }
  $('#fileInput').onchange = (e) => chooseFile(e.target.files[0]);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0]); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#fileInput').click(); });

  $('#pane-upload').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!file) return msg(t('v.fileRequired'));
    const btn = $('button[type=submit]', ev.target);
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    send('upload', {
      fileName: file.name, data, qr: qrRaw, invoiceNumber: val('#u_invoiceNumber'), sellerName: val('#u_sellerName'),
      vatNumber: val('#u_vatNumber'), date: val('#u_date'), total: val('#u_total'), vatAmount: val('#u_vatAmount'),
    }, btn);
  };

  /* ---------- Camera QR ---------- */
  async function startCam() {
    msg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return msg(t('v.camNone'));
    if (!(await initEngine())) return msg(t('v.libFail'));
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e) { return msg(t('v.camDenied')); }
    const v = $('#video');
    v.srcObject = stream; await v.play();
    v.classList.remove('hidden'); $('#camFrame').classList.remove('hidden'); $('#camHint').classList.add('hidden');
    $('#camBtn').textContent = t('v.stopCam'); $('#camBtn').dataset.on = '1';
    const cv = document.createElement('canvas');
    const tick = async () => {
      if (!stream) return;
      if (v.videoWidth) {
        cv.width = v.videoWidth; cv.height = v.videoHeight;
        cv.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0);
        const r = await detect(v, cv);
        if (r) { stopCam(); return onQr(r); }
      }
      timer = setTimeout(tick, 180);
    };
    tick();
  }
  function stopCam() {
    clearTimeout(timer);
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    const v = $('#video'); v.srcObject = null; v.classList.add('hidden');
    $('#camFrame').classList.add('hidden'); $('#camHint').classList.remove('hidden');
    $('#camBtn').textContent = t('v.startCam'); delete $('#camBtn').dataset.on;
  }
  function onQr(raw) {
    qrRaw = raw;
    const d = tlvDecode(raw);
    $('#qrPrev').innerHTML = d
      ? `<b style="color:var(--ok)">✓ ${esc(t('v.qrFound'))}</b>
         <div><span>${t('fn.sellerName')}</span><b>${esc(d[1])}</b></div><div><span>${t('fn.vatNumber')}</span><b class="num">${esc(d[2])}</b></div>
         <div><span>${t('fn.date')}</span><b class="num">${esc(d[3] || '—')}</b></div><div><span>${t('fn.total')}</span><b class="num">${esc(d[4] || '—')}</b></div>
         <div><span>${t('fn.vatAmount')}</span><b class="num">${esc(d[5] || '—')}</b></div>`
      : `<b style="color:var(--warn)">! ${esc(t('v.qrRaw'))}</b><code class="num" style="word-break:break-all">${esc(raw.slice(0, 200))}</code>`;
    $('#qrResult').classList.remove('hidden');
  }
  $('#camBtn').onclick = () => (stream ? stopCam() : startCam());
  $('#qrAgain').onclick = () => { $('#qrResult').classList.add('hidden'); qrRaw = ''; startCam(); };
  $('#qrSubmit').onclick = (e) => send('qr', { qr: qrRaw, invoiceNumber: val('#q_invoiceNumber') }, e.target);

  /* ---------- Manual ---------- */
  $('#pane-manual').onsubmit = (ev) => {
    ev.preventDefault();
    send('manual', {
      invoiceNumber: val('#m_invoiceNumber'), sellerName: val('#m_sellerName'), vatNumber: val('#m_vatNumber'),
      date: val('#m_date'), total: val('#m_total'), vatAmount: val('#m_vatAmount'), qr: val('#m_qr'),
    }, $('button[type=submit]', ev.target));
  };
  function fillSample(bad) {
    const n = 100 + Math.floor(Math.random() * 9900), vat = Math.round(n * 15) / 100, total = Math.round((n + vat) * 100) / 100;
    const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const seller = LANG === 'ar' ? 'شركة النور للتجارة' : 'Al Noor Trading Co.';
    const qrTotal = bad ? (total - 100).toFixed(2) : total.toFixed(2);
    $('#m_invoiceNumber').value = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    $('#m_sellerName').value = seller; $('#m_vatNumber').value = '300012345600003'; $('#m_date').value = date;
    $('#m_total').value = total.toFixed(2); $('#m_vatAmount').value = vat.toFixed(2);
    $('#m_qr').value = tlvEncode([seller, '300012345600003', date + 'T10:30:00Z', qrTotal, vat.toFixed(2)]);
  }
  $('#sampleOk').onclick = () => fillSample(false);
  $('#sampleBad').onclick = () => fillSample(true);

  window.addEventListener('pagehide', stopCam);
  boot('verify', {
    auth: true,
    onLang: () => {
      if (lastRec) showResult(lastRec); else $('#result').innerHTML = `<div class="empty-res">${esc(t('r.empty'))}</div>`;
      if (stream) $('#camBtn').textContent = t('v.stopCam');
    },
  }).then((u) => { if (u) setMethod(location.hash.slice(1)); });
})();
