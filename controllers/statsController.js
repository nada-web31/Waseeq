const { db } = require('../database/db');

exports.stats = (req, res) => {
  const uid = req.user.id;
  const t = db.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(status='valid'),0) valid, COALESCE(SUM(status='suspicious'),0) suspicious,
      COALESCE(SUM(status='invalid'),0) invalid, COALESCE(SUM(status='pending'),0) pending_status,
      COALESCE(SUM(review_status='pending'),0) pending_reviews
    FROM verifications WHERE user_id = ?`).get(uid);

  const days = 14, labels = [];
  for (let i = days - 1; i >= 0; i--) labels.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const rows = db.prepare(`SELECT substr(created_at,1,10) d, status, COUNT(*) c FROM verifications
    WHERE user_id = ? AND substr(created_at,1,10) >= ? GROUP BY d, status`).all(uid, labels[0]);
  const daily = labels.map((d) => ({ date: d, valid: 0, suspicious: 0, invalid: 0, pending: 0 }));
  rows.forEach((r) => { const x = daily.find((o) => o.date === r.d); if (x && x[r.status] !== undefined) x[r.status] = Number(r.c); });

  const methods = { upload: 0, qr: 0, manual: 0 };
  db.prepare('SELECT method, COUNT(*) c FROM verifications WHERE user_id = ? GROUP BY method').all(uid)
    .forEach((r) => { methods[r.method] = Number(r.c); });

  const recent = db.prepare(`SELECT id, method, invoice_number, seller_name, total, status, score, created_at
    FROM verifications WHERE user_id = ? ORDER BY id DESC LIMIT 8`).all(uid);

  res.json({
    totals: {
      total: Number(t.total), valid: Number(t.valid), suspicious: Number(t.suspicious), invalid: Number(t.invalid),
      pending: Number(t.pending_reviews), pending_status: Number(t.pending_status),
    },
    daily, methods, recent,
  });
};
