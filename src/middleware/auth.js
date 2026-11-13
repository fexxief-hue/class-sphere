const pool = require('../db');

function wantsHtml(req) {
  return req.get('Sec-Fetch-Dest') === 'document' && req.accepts('html');
}

async function requireAuth(req, res, next) {
  try {
    const userId = req.session && req.session.userId;
    if (!userId) return wantsHtml(req) ? res.redirect('/login.html') : res.status(401).json({ error: 'Sign in is required.' });
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role, status, email_verified_at, admin_approved_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || (!user.email_verified_at && !user.admin_approved_at)) {
      req.session.destroy(() => {});
      return wantsHtml(req) ? res.redirect('/login.html') : res.status(401).json({ error: 'Sign in is required.' });
    }
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return wantsHtml(req) ? res.status(403).send('You do not have access to this area.') : res.status(403).json({ error: 'You do not have access to this area.' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
