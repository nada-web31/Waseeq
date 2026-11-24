// Local verification engine. NOT official government verification.
const crypto = require('crypto');

const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const norm = (s) => String(s == null ? '' : s)
  .replace(/[٠-٩]/g, (d) => AR.indexOf(d)).replace(/[۰-۹]/g, (d) => FA.indexOf(d))
  .replace(/٫/g, '.').replace(/٬/g, ',').trim();
const num = (s) => { const v = norm(s).replace(/,/g, ''); return /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN; };
const r2 = (n) => Math.round(n * 100) / 100;
const sameText = (a, b) => String(a).replace(/\s+/g, ' ').trim().toLowerCase() === String(b).replace(/\s+/g, ' ').trim().toLowerCase();

// TLV (Base64) QR as used by Saudi e-invoices: 1 seller, 2 VAT no., 3 timestamp, 4 total, 5 VAT amount
function decodeQr(raw) {
  const s = String(raw || '').replace(/\s/g, '');
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const buf = Buffer.from(s, 'base64');
  const out = {};
  let i = 0;
  while (i < buf.length) {
    if (i + 2 > buf.length) return null;
    const tag = buf[i], len = buf[i + 1];
    if (i + 2 + len > buf.length) return null;
    if (tag >= 1 && tag <= 5) out[tag] = buf.slice(i + 2, i + 2 + len).toString('utf8');
    i += 2 + len;
  }
  if (!out[1] || !out[2]) return null;
  return { sellerName: out[1], vatNumber: norm(out[2]), timestamp: out[3] || '', total: norm(out[4] || ''), vatAmount: norm(out[5] || '') };
}

function encodeQr(o) {
  const parts = [o.sellerName, o.vatNumber, o.timestamp, o.total, o.vatAmount].map((v, i) => {
    const b = Buffer.from(String(v), 'utf8');
    return Buffer.concat([Buffer.from([i + 1, b.length]), b]);
  });
  return Buffer.concat(parts).toString('base64');
}

const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const dayDiff = (a, b) => Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);

function fingerprint(f) {
  if (!f.vatNumber || !f.date || isNaN(f.total) || isNaN(f.vatAmount)) return '';
  return crypto.createHash('sha256').update([f.vatNumber, f.date, r2(f.total).toFixed(2), r2(f.vatAmount).toFixed(2)].join('|')).digest('hex');
}

/**
 * input: { invoiceNumber, sellerName, vatNumber, date, total, vatAmount, qr }
 * ctx:   { related: rows[], fileDup: bool, hasFile: bool }
 */
function verify(input, ctx = {}) {
  const checks = [];
  const add = (id, level, code, params) => checks.push({ id, level, code, params: params || {} });

  const given = {
    invoiceNumber: norm(input.invoiceNumber), sellerName: String(input.sellerName || '').trim(),
    vatNumber: norm(input.vatNumber), date: norm(input.date), total: norm(input.total), vatAmount: norm(input.vatAmount),
  };
  const qrRaw = String(input.qr || '').trim();
  const qr = qrRaw ? decodeQr(qrRaw) : null;
  const f = { ...given };
  if (qr) {
    f.sellerName = f.sellerName || qr.sellerName;
    f.vatNumber = f.vatNumber || qr.vatNumber;
    f.date = f.date || qr.timestamp.slice(0, 10);
    f.total = f.total || qr.total;
    f.vatAmount = f.vatAmount || qr.vatAmount;
  }

  if (ctx.hasFile) add('file', 'pass', 'file_ok');
  const hasData = !!(f.invoiceNumber || f.sellerName || f.vatNumber || f.date || f.total || f.vatAmount);
  if (ctx.hasFile && !hasData && !qrRaw) {
    add('data', 'info', 'file_only');
    if (ctx.fileDup) add('filedup', 'warn', 'file_dup');
    return finish(f, checks, 'pending');
  }

  // 1) Required fields
  const missing = ['sellerName', 'vatNumber', 'date', 'total', 'vatAmount'].filter((k) => !f[k]);
  if (!f.invoiceNumber && !qr) missing.unshift('invoiceNumber');
  if (missing.length) add('fields', 'fail', 'fields_missing', { fields: missing });
  else add('fields', 'pass', 'fields_ok');
  if (!f.invoiceNumber && qr) add('invno', 'info', 'invoice_number_missing');

  // 2) Format checks
  if (f.invoiceNumber) {
    if (/^[\p{L}\p{N}\-_/. ]{1,40}$/u.test(f.invoiceNumber)) add('invno', 'pass', 'invoice_number_ok');
    else add('invno', 'fail', 'invoice_number_bad');
  }
  if (f.sellerName && f.sellerName.length > 200) add('seller', 'fail', 'seller_bad');
  if (f.vatNumber) {
    if (/^3\d{13}3$/.test(f.vatNumber)) add('vat', 'pass', 'vat_ok'); else add('vat', 'fail', 'vat_bad');
  }
  let dateOk = false;
  if (f.date) {
    if (!validDate(f.date)) add('date', 'fail', 'date_bad');
    else if (f.date > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) add('date', 'warn', 'date_future');
    else { add('date', 'pass', 'date_ok'); dateOk = true; }
    if (validDate(f.date)) dateOk = true;
  }

  // 3) Amounts
  const total = num(f.total), vat = num(f.vatAmount);
  f.total = total; f.vatAmount = vat;
  if (given.total || given.vatAmount || qr) {
    if (f.total === f.total && f.vatAmount === f.vatAmount) {
      if (total > 0 && vat >= 0 && vat < total) {
        add('amounts', 'pass', 'amount_ok');
        const rate = dateOk && f.date < '2020-07-01' ? 5 : 15;
        const expected = r2((total - vat) * rate / 100);
        if (vat === 0) add('vatmath', 'warn', 'vat_zero');
        else if (Math.abs(vat - expected) <= 0.06) add('vatmath', 'pass', 'vat_math_ok', { rate });
        else add('vatmath', 'warn', 'vat_math_bad', { rate, expected: expected.toFixed(2), actual: r2(vat).toFixed(2) });
      } else add('amounts', 'fail', 'amount_bad');
    } else if (given.total || given.vatAmount) add('amounts', 'fail', 'amount_bad');
  }

  // 4) QR consistency
  if (!qrRaw) add('qr', 'info', 'qr_none');
  else if (!qr) add('qr', 'warn', 'qr_bad');
  else {
    const diff = [];
    if (given.sellerName && !sameText(given.sellerName, qr.sellerName)) diff.push('sellerName');
    if (given.vatNumber && given.vatNumber !== qr.vatNumber) diff.push('vatNumber');
    if (given.total && !(Math.abs(num(given.total) - num(qr.total)) <= 0.01)) diff.push('total');
    if (given.vatAmount && !(Math.abs(num(given.vatAmount) - num(qr.vatAmount)) <= 0.01)) diff.push('vatAmount');
    if (given.date && qr.timestamp && validDate(given.date) && validDate(qr.timestamp.slice(0, 10)) &&
        dayDiff(given.date, qr.timestamp.slice(0, 10)) > 1) diff.push('date');
    if (diff.length) add('qr', 'warn', 'qr_mismatch', { fields: diff });
    else add('qr', 'pass', 'qr_ok');
  }

  // 5) Duplicates / record comparison
  const fp = fingerprint(f);
  const related = ctx.related || [];
  const same = related.filter((r) => fp && r.fingerprint === fp);
  const conflict = related.filter((r) => !(fp && r.fingerprint === fp) && f.invoiceNumber &&
    r.invoice_number === f.invoiceNumber && f.vatNumber && r.vat_number === f.vatNumber);
  if (same.length) add('dup', 'warn', 'dup_same', { count: same.length });
  else if (conflict.length) {
    const r = conflict[0], d = [];
    if (r.total !== total) d.push('total');
    if (r.vat_amount !== vat) d.push('vatAmount');
    if (r.invoice_date !== f.date) d.push('date');
    if (!sameText(r.seller_name, f.sellerName)) d.push('sellerName');
    add('dup', 'warn', 'dup_conflict', { fields: d.length ? d : ['total'] });
  } else add('dup', 'pass', 'dup_none');
  if (ctx.fileDup) add('filedup', 'warn', 'file_dup');

  return finish(f, checks, null, fp);
}

function finish(f, checks, forced, fp) {
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const status = forced || (fails ? 'invalid' : warns ? 'suspicious' : 'valid');
  const score = forced ? 50 : Math.max(0, 100 - fails * 35 - warns * 15);
  return { status, score, fields: f, checks, fingerprint: fp || '' };
}

module.exports = { verify, decodeQr, encodeQr, norm, num };
