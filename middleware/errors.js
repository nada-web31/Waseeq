class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

function notFound(req, res) { res.status(404).json({ error: 'not_found' }); }

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...(err.extra || {}) });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'file_too_large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}
module.exports = { HttpError, fail, notFound, errorHandler };
