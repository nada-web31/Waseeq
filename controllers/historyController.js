const fs = require('fs');
const path = require('path');
const { db } = require('../database/db');
const { fail } = require('../middleware/errors');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const STATUSES = ['valid', 'suspicious', 'invalid', 'pending'];
const COLS = 'id, method, invoice_number, seller_name, vat_number, invoice_date, total, vat_amount, file_name, status, score, review_status, created_at';

function getId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) fail(400, 'bad_id');
  return id;
}
function own(req) {
  const row = db.prepare('SELECT * FROM verifications WHERE id = ? AND user_id = ?').get(getId(req), req.user.id);
  if (!row) fail(404, 'not_found');
  return row;
}

exports.list = (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = String(req.query.status || '');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const where = ['user_id = ?'], args = [req.user.id];
  if (STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (status === 'review') where.push("review_status = 'pending'");
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    where.push(`(invoice_number LIKE ? ESCAPE '\\' OR seller_name LIKE ? ESCAPE '\\' OR vat_number LIKE ? ESCAPE '\\' OR file_name LIKE ? ESCAPE '\\')`);
    args.push(like, like, like, like);
  }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM verifications WHERE ${w}`).get(...args).c;
  const items = db.prepare(`SELECT ${COLS} FROM verifications WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
};

exports.get = (req, res) => {
  const r = own(req);
  const { checks_json, file_path, file_hash, ...rest } = r;
  res.json({ ...rest, checks: JSON.parse(checks_json || '[]'), has_file: !!file_path });
};

exports.remove = (req, res) => {
  const r = own(req);
  db.prepare('DELETE FROM verifications WHERE id = ? AND user_id = ?').run(r.id, req.user.id);
  if (r.file_path) fs.unlink(path.join(UPLOAD_DIR, path.basename(r.file_path)), () => {});
  res.json({ ok: true });
};

exports.review = (req, res) => {
  const r = own(req);
  const b = req.body || {};
  let status = r.status;
  if (b.status !== undefined && b.status !== '') {
    if (!['valid', 'suspicious', 'invalid'].includes(b.status)) fail(400, 'status_invalid');
    status = b.status;
  }
  const note = String(b.note || '').trim().slice(0, 500);
  db.prepare("UPDATE verifications SET status = ?, review_status = 'reviewed', review_note = ? WHERE id = ?").run(status, note, r.id);
  res.json({ ok: true, status });
};

exports.file = (req, res) => {
  const r = own(req);
  if (!r.file_path) fail(404, 'not_found');
  const full = path.join(UPLOAD_DIR, path.basename(r.file_path));
  if (!fs.existsSync(full)) fail(404, 'not_found');
  res.setHeader('Content-Type', r.file_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(full).pipe(res);
};
