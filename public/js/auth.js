(async () => {
  await boot('login', { light: true });
  if (await getUser()) { location.href = '/dashboard.html'; return; }
  const next = new URLSearchParams(location.search).get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard.html';
  const show = (tab) => {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#loginForm').classList.toggle('hidden', tab !== 'login');
    $('#registerForm').classList.toggle('hidden', tab !== 'register');
    $('#msg').innerHTML = '';
  };
  $$('.tab').forEach((b) => { b.onclick = () => show(b.dataset.tab); });
  if (location.hash === '#register') show('register');
  const err = (e) => { $('#msg').innerHTML = `<div class="msg err">${esc(errText(e))}</div>`; };

  async function submit(form, path, body) {
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try { await api(path, { method: 'POST', body }); location.href = dest; }
    catch (e) { err(e); btn.disabled = false; }
  }
  $('#loginForm').onsubmit = (ev) => { ev.preventDefault(); submit(ev.target, '/auth/login', { email: $('#le').value, password: $('#lp').value }); };
  $('#registerForm').onsubmit = (ev) => { ev.preventDefault(); submit(ev.target, '/auth/register', { name: $('#rn').value, email: $('#re').value, password: $('#rp').value }); };
})();
