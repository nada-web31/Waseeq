const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, now } = require('../database/db');
const { fail } = require('../middleware/errors');
const engine = require('./engine');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 8 * 1024 * 1024;
const str = (v, max) => String(v == null ? '' : v).slice(0, max);

function pickInput(b) {
  return {
    invoiceNumber: str(b.invoiceNumber, 60), sellerName: str(b.sellerName, 250), vatNumber: str(b.vatNumber, 30),
    date: str(b.date, 20), total: str(b.total, 30), vatAmount: str(b.vatAmount, 30), qr: str(b.qr, 2000),
  };
}

function detectType(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

function run(req, res, method, input, file) {
  const probe = engine.verify(input, { related: [], hasFile: !!file }); // normalised fields for lookups
  const fp = probe.fingerprint;
  const num = probe.fields.invoiceNumber || '';
  const related = db.prepare(
    `SELECT invoice_number, vat_number, seller_name, invoice_date, total, vat_amount, fingerprint FROM verifications
     WHERE (invoice_number = ? AND invoice_number != '') OR (fingerprint = ? AND fingerprint != '')`).all(num, fp);
  const fileDup = file ? !!db.prepare('SELECT id FROM verifications WHERE file_hash = ?').get(file.hash) : false;
  const result = engine.verify(input, { related, fileDup, hasFile: !!file });
  const f = result.fields;

  let filePath = '';
  if (file) {
    filePath = crypto.randomBytes(16).toString('hex') + '.' + file.ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, filePath), file.buf, { mode: 0o600 });
  }
  const review = result.status === 'suspicious' || result.status === 'pending' ? 'pending' : 'none';
  const finite = (n) => (Number.isFinite(n) ? n : null);
  const r = db.prepare(`INSERT INTO verifications
    (user_id, method, invoice_number, seller_name, vat_number, invoice_date, total, vat_amount, qr_raw, fingerprint,
     file_name, file_path, file_type, file_hash, status, score, checks_json, review_status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, method, f.invoiceNumber || '', f.sellerName || '', f.vatNumber || '', f.date || '',
      finite(f.total), finite(f.vatAmount), input.qr || '', result.fingerprint, file ? file.name : '', filePath,
      file ? file.mime : '', file ? file.hash : '', result.status, result.score, JSON.stringify(result.checks), review, now());
  res.status(201).json({
    id: Number(r.lastInsertRowid), method, status: result.status, score: result.score, checks: result.checks,
    fields: { ...f, total: finite(f.total), vatAmount: finite(f.vatAmount) }, review_status: review,
  });
}

exports.manual = (req, res) => {
  const input = pickInput(req.body || {});
  if (!Object.values(input).some((v) => v)) fail(400, 'empty_input');
  run(req, res, 'manual', input, null);
};

exports.qr = (req, res) => {
  const input = pickInput(req.body || {});
  if (!input.qr.trim()) fail(400, 'qr_required');
  run(req, res, 'qr', { invoiceNumber: input.invoiceNumber, qr: input.qr }, null);
};

exports.upload = (req, res) => {
  const b = req.body || {};
  let data = String(b.data || '');
  data = data.replace(/^data:[^,]*;base64,/, '');
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail(400, 'file_required');
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) fail(400, 'file_required');
  if (buf.length > MAX_BYTES) fail(413, 'file_too_large');
  const type = detectType(buf);
  if (!type) fail(415, 'file_type_invalid');
  const name = path.basename(str(b.fileName, 120)).replace(/[^\p{L}\p{N}._\- ]/gu, '_') || ('invoice.' + type.ext);
  const file = { buf, name, mime: type.mime, ext: type.ext, hash: crypto.createHash('sha256').update(buf).digest('hex') };
  run(req, res, 'upload', pickInput(b), file);
};
