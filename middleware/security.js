function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
}

// Tiny in-memory rate limiter (per IP)
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || (req.socket && req.socket.remoteAddress) || 'x';
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return next(); }
    if (++rec.n > max) return res.status(429).json({ error: 'too_many_requests' });
    next();
  };
}
module.exports = { securityHeaders, rateLimit };
