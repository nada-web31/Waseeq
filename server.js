const fs = require('fs');
const path = require('path');

// Minimal .env loader (no extra dependency)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* no .env file */ }

const express = require('express');
require('./database/db');
const { securityHeaders } = require('./middleware/security');
const { attachUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use('/api/verify/upload', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(attachUser);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/verify', require('./routes/verify'));
app.use('/api/history', require('./routes/history'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api', notFound);

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Waseeq running on http://localhost:${PORT}`));
}
module.exports = app;
