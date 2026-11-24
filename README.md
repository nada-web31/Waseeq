# Waseeq (وثيق) — Invoice Verification

Arabic-first (RTL) invoice verification web app with English switcher.
Stack: HTML5, CSS3, vanilla JavaScript, Node.js, Express, SQLite. No frontend frameworks.

> **Important:** Waseeq performs **local checks only**. It is **not** official government (e.g. ZATCA) verification.

## Run on Windows
1. Install Node.js (**22.13 or newer recommended**): https://nodejs.org
2. In this folder run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

Or just double-click `start.bat` (installs on first run, then opens the browser).

SQLite: Node 22.13+ uses its built-in SQLite (no native build). On older Node versions, `npm install` installs `better-sqlite3` automatically as a fallback.

## Using the app
Register → Verify (Upload / Scan QR / Manual) → Dashboard → History.
On the Manual tab use **"Fill a valid sample"** / **"Fill a suspicious sample"** to try the engine instantly.

## Verification engine (`controllers/engine.js`)
- Required fields, invoice-number format, 15-digit VAT number (starts and ends with 3), real calendar date, future dates.
- Amount sanity and VAT arithmetic (15%, or 5% for invoices before 2020-07-01).
- QR (Base64 TLV, Saudi e-invoice layout) decoded and compared with typed fields.
- Duplicate detection by invoice number + seller and by a data fingerprint; conflicting records; duplicate files (SHA-256).
- Result: `valid`, `suspicious` or `invalid`. Files with no readable data (e.g. a PDF alone) become `pending` for manual review.
- Suspicious/pending records appear under "Pending reviews"; reviewing them in History lets you set a final verdict.

## Notes
- Internet is needed only for the Google Font (Cairo, falls back to system fonts) and, on browsers without the native `BarcodeDetector` (e.g. Chrome on Windows), a one-time load of the jsQR library from cdnjs for QR scanning. Camera access works on `localhost`.
- PDF content cannot be read locally; enter the invoice data (or use an image with a QR) to get a full check.
- Uploads: JPG/PNG/PDF, max 8 MB, type verified by file signature, stored under random names in `uploads/` and served only to the owner.
- Passwords: scrypt with per-user salt. Sessions: random token, stored hashed, HttpOnly + SameSite cookie. Set `COOKIE_SECURE=true` behind HTTPS.

## Structure
```
server.js            Express app
database/db.js      SQLite init + schema
routes/             auth, verify, history, stats
controllers/        auth, verify, history, stats, engine
middleware/         auth, security headers + rate limit, errors
public/             html pages, css/, js/ (i18n.js = AR/EN), images/
uploads/            uploaded invoices (git-ignored)
```

## API
`POST /api/auth/register|login|logout`, `GET /api/auth/me` ·
`POST /api/verify/manual|qr|upload` · `GET /api/history?q=&status=&page=` ·
`GET|DELETE /api/history/:id`, `PATCH /api/history/:id/review`, `GET /api/history/:id/file` · `GET /api/stats`
"# Waseeq" 
"# Waseeq" 
"# Waseeq" 
