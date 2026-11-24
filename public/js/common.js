/* Shared helpers: API, nav, footer, formatting, result renderer */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  let res;
  try { res = await fetch('/api' + path, o); } catch (e) { throw { error: 'network' }; }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) throw { error: data.error || 'server_error', status: res.status };
  return data;
}
const errText = (e) => t('err.' + (e && e.error ? e.error : 'server_error'));

let _user;
async function getUser(force) {
  if (_user === undefined || force) {
    try { _user = (await api('/auth/me')).user; } catch (e) { _user = null; }
  }
  return _user;
}
async function requireAuth() {
  const u = await getUser();
  if (!u) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return null; }
  return u;
}

function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

const loc = () => (LANG === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');
const fmtNum = (n) => (n == null || n === '' ? '—' : new Intl.NumberFormat(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n));
const fmtInt = (n) => new Intl.NumberFormat(loc()).format(n || 0);
const fmtDate = (iso) => new Date(iso).toLocaleString(LANG === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
const badge = (s) => `<span class="badge b-${esc(s)}">${esc(t('s.' + s))}</span>`;

/* ---- Nav & footer ---- */
async function renderNav(active, light) {
  const u = await getUser();
  const nav = $('#nav');
  const home = (h) => (active === 'home' ? h : '/' + h);
  nav.className = 'nav' + (light ? ' light' : '');
  nav.innerHTML = `<div class="container">
    <a class="brand" href="/"><img src="/images/logo.svg" alt="">${esc(LANG === 'ar' ? 'وثيق' : 'Waseeq')}</a>
    <button class="burger" aria-label="menu" id="burger">☰</button>
    <nav class="nav-links">
      <a href="/" class="${active === 'home' ? 'active' : ''}">${t('nav.home')}</a>
      <a href="${home('#methods')}">${t('nav.methods')}</a>
      <a href="${home('#features')}">${t('nav.features')}</a>
      <a href="${home('#about')}">${t('nav.about')}</a>
      <a href="${home('#faq')}">${t('nav.faq')}</a>
      <a href="/verify.html" class="${active === 'verify' ? 'active' : ''}">${t('nav.verify')}</a>
      ${u ? `<a href="/dashboard.html" class="${active === 'dashboard' ? 'active' : ''}">${t('nav.dashboard')}</a>
      <a href="/history.html" class="${active === 'history' ? 'active' : ''}">${t('nav.history')}</a>` : ''}
    </nav>
    <div class="nav-end">
      <button class="lang" id="langBtn">${LANG === 'ar' ? 'EN' : 'عربي'}</button>
      ${u ? `<span class="user-chip">${esc(u.name)}</span><button class="btn btn-ghost btn-sm" id="logoutBtn">${t('nav.logout')}</button>`
          : `<a class="btn btn-primary btn-sm" href="/login.html">${t('nav.login')}</a>`}
    </div></div>`;
  $('#burger').onclick = () => nav.classList.toggle('open');
  $('#langBtn').onclick = () => setLang(LANG === 'ar' ? 'en' : 'ar');
  const lo = $('#logoutBtn');
  if (lo) lo.onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); _user = null; location.href = '/'; };
}

function renderFooter() {
  const f = $('#footer');
  if (!f) return;
  f.className = 'footer';
  f.innerHTML = `<div class="container">
    <a class="brand" href="/"><img src="/images/logo.svg" alt="">${LANG === 'ar' ? 'وثيق' : 'Waseeq'}</a>
    <div class="footer-links"><a href="/verify.html">${t('nav.verify')}</a><a href="/dashboard.html">${t('nav.dashboard')}</a><a href="/history.html">${t('nav.history')}</a><a href="/#faq">${t('nav.faq')}</a></div>
    <div>${t('foot.copy')} · ${t('foot.disc')}</div></div>`;
}

/* Boot a page: apply i18n, nav, footer, and re-render on language change */
function boot(active, { light = false, auth = false, onLang } = {}) {
  const run = async () => { applyI18n(); await renderNav(active, light); renderFooter(); if (onLang) onLang(); };
  document.addEventListener('langchange', run);
  return (async () => {
    if (auth) { const u = await requireAuth(); if (!u) return null; }
    await run();
    return getUser();
  })();
}

/* ---- Result renderer (verify page + history dialog) ---- */
function checkText(c) {
  const p = { ...c.params };
  if (Array.isArray(p.fields)) p.fields = p.fields.map((k) => t('fn.' + k)).join(LANG === 'ar' ? '، ' : ', ');
  return t('chk.' + c.code, p);
}
function renderChecks(checks) {
  const icon = { pass: '✓', warn: '!', fail: '✕', info: 'i' };
  return `<ul class="checks">${checks.map((c) => `<li><span class="lv ${esc(c.level)}">${icon[c.level] || 'i'}</span><span>${esc(checkText(c))}</span></li>`).join('')}</ul>`;
}
function renderResult(rec) {
  const color = { valid: 'var(--ok)', suspicious: 'var(--warn)', invalid: 'var(--bad)', pending: 'var(--pend)' }[rec.status];
  const sym = { valid: '✓', suspicious: '!', invalid: '✕', pending: '…' }[rec.status];
  return `<div class="verdict st-${esc(rec.status)}"><span class="dot">${sym}</span>
      <div><h3>${esc(t('r.' + rec.status))}</h3><p>${esc(t('r.' + rec.status + '.d'))}</p></div></div>
    <div class="muted" style="font-size:.85rem;font-weight:700">${t('r.score')}: <span class="num">${fmtInt(rec.score)}/100</span></div>
    <div class="score"><i style="width:${Math.max(4, rec.score)}%;background:${color}"></i></div>
    <h4 style="margin:0 0 10px">${t('r.checks')}</h4>${renderChecks(rec.checks)}
    <div class="disclaimer">⚠ ${t('r.disc')}</div>`;
}
