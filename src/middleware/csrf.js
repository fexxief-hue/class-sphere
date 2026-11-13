const { randomBytes, timingSafeEqual } = require('node:crypto');

function issueCsrfToken(req, res) {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('base64url');
  req.session.save((error) => {
    if (error) return res.status(503).json({ error: 'The session could not be created.' });
    res.json({ csrfToken: req.session.csrfToken });
  });
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const presented = req.get('X-CSRF-Token');
  const expected = req.session && req.session.csrfToken;
  if (!presented || !expected) return res.status(403).json({ error: 'Request could not be verified.' });
  const actualBuffer = Buffer.from(presented);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(403).json({ error: 'Request could not be verified.' });
  }
  next();
}

module.exports = { issueCsrfToken, requireCsrf };
