const crypto = require('crypto');
const { db } = require('../database/db');
const { HttpError } = require('./errors');

const COOKIE = 'wsq_sid';
const DAYS = Number(process.env.SESSION_DAYS) || 7;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function cookieFlags() {
  return 'Path=/; HttpOnly; SameSite=Lax' + (process.env.COOKIE_SECURE === 'true' ? '; Secure' : '');
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha(token), userId, Date.now() + DAYS * 864e5);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${DAYS * 86400}; ${cookieFlags()}`);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags()}`);
}

function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  if (token) {
    const row = db.prepare(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), Date.now());
    if (row) req.user = { id: row.id, name: row.name, email: row.email };
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'unauthorized'));
  next();
}

module.exports = { createSession, destroySession, attachUser, requireAuth };
