const crypto = require('crypto');
const { db, now } = require('../database/db');
const { fail } = require('../middleware/errors');
const { createSession, destroySession } = require('../middleware/auth');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
const DUMMY = hashPassword('dummy-password-1');

exports.register = (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (name.length < 2 || name.length > 60) fail(400, 'name_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) fail(400, 'email_invalid');
  if (password.length < 8 || password.length > 128 || !/[A-Za-z\u0600-\u06FF]/.test(password) || !/\d/.test(password)) fail(400, 'password_weak');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) fail(409, 'email_taken');
  const r = db.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(name, email, hashPassword(password), now());
  const id = Number(r.lastInsertRowid);
  createSession(res, id);
  res.status(201).json({ user: { id, name, email } });
};

exports.login = (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '').slice(0, 128);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = checkPassword(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) fail(401, 'invalid_credentials');
  createSession(res, u.id);
  res.json({ user: { id: u.id, name: u.name, email: u.email } });
};

exports.logout = (req, res) => { destroySession(req, res); res.json({ ok: true }); };

exports.me = (req, res) => {
  if (!req.user) fail(401, 'unauthorized');
  res.json({ user: req.user });
};
