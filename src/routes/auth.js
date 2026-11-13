const express = require('express');
const argon2 = require('argon2');
const { rateLimit } = require('express-rate-limit');
const { createHash, randomBytes } = require('node:crypto');
const pool = require('../db');
const { issueCsrfToken, requireCsrf } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { isConfigured, sendVerificationEmail, sendPasswordResetEmail } = require('../services/mail');

const router = express.Router();
const genericLoginError = 'Admission number or password is incorrect.';
const verificationResult = 'If eligible, account setup instructions will be provided.';
const dummyHashPromise = argon2.hash(randomBytes(32).toString('base64'));

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Try again later.' },
});

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';

router.use(requireCsrf);

router.get('/status', (_req, res) => {
  res.json({ emailVerificationAvailable: isConfigured() && Boolean(process.env.APP_BASE_URL), passwordResetAvailable: isConfigured() && Boolean(process.env.APP_BASE_URL), adminAiAvailable: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) });
});

router.get('/csrf', issueCsrfToken);

router.post('/register', registrationLimiter, async (req, res, next) => {
  const fullName = cleanString(req.body.fullName);
  const admissionNumber = cleanString(req.body.admissionNumber);
  const email = cleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const passwordConfirmation = typeof req.body.passwordConfirmation === 'string' ? req.body.passwordConfirmation : '';

  if (fullName.length < 2 || fullName.length > 160) return res.status(400).json({ error: 'Enter your full name (2 to 160 characters).' });
  if (!/^SB62\/\S{1,45}$/.test(admissionNumber)) return res.status(400).json({ error: 'Admission numbers must begin with SB62/ and include the remaining number.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Use a password between 12 and 128 characters.' });
  if (password !== passwordConfirmation) return res.status(400).json({ error: 'The passwords do not match.' });
  const mailReady = isConfigured() && Boolean(process.env.APP_BASE_URL);
  const connection = await pool.getConnection();
  let newUserId;
  let token;
  try {
    await connection.beginTransaction();
    const passwordHash = await argon2.hash(password);
    const [result] = await connection.execute(
      'INSERT INTO users (full_name, admission_number, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [fullName, admissionNumber, email, passwordHash, 'student', 'pending_email']
    );
    newUserId = result.insertId;
    if (mailReady) {
      token = randomBytes(32).toString('base64url');
      await connection.execute('INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))',[newUserId, tokenHash(token)]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();
    if (error.code === 'ER_DUP_ENTRY') return res.status(202).json({ message: verificationResult });
    return next(error);
  }
  connection.release();

  if (!mailReady) return res.status(202).json({message:'Registration received. An administrator must approve your account before you can sign in.'});
  try {
    await sendVerificationEmail(email, token);
    return res.status(202).json({ message: verificationResult });
  } catch (error) {
    await pool.execute('DELETE FROM users WHERE id = ? AND status = ?', [newUserId, 'pending_email']).catch(() => {});
    if (error.code === 'MAIL_NOT_CONFIGURED') return res.status(503).json({ error: 'Email verification is not configured yet. Registration is unavailable until a mail service is set up.' });
    return res.status(503).json({ error: 'The verification message could not be sent. Please try again later.' });
  }
});

const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many password-reset requests. Try again later.' } });

router.post('/password-reset/request', passwordResetLimiter, async (req,res,next)=>{
  const email=cleanString(req.body.email).toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid email address.'});
  if(!isConfigured()||!process.env.APP_BASE_URL)return res.status(503).json({error:'Password reset is unavailable until email is configured.'});
  const generic={message:'If an active account matches that address, password reset instructions will be sent.'};
  try{
    const [users]=await pool.execute('SELECT id FROM users WHERE email=? AND status=? AND email_verified_at IS NOT NULL LIMIT 1',[email,'active']);
    if(!users.length)return res.json(generic);
    const userId=users[0].id;const token=randomBytes(32).toString('base64url');
    await pool.execute('DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL',[userId]);
    await pool.execute('INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))',[userId,tokenHash(token)]);
    try{await sendPasswordResetEmail(email,token);}catch{await pool.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE token_hash=?',[tokenHash(token)]);}
    return res.json(generic);
  }catch(error){next(error);}
});

router.post('/password-reset/complete', verificationLimiter, async(req,res,next)=>{
  const token=cleanString(req.body.token);const password=typeof req.body.password==='string'?req.body.password:'';const confirmation=typeof req.body.passwordConfirmation==='string'?req.body.passwordConfirmation:'';
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return res.status(400).json({error:'This reset link is invalid or expired.'});
  if(password.length<12||password.length>128||password!==confirmation)return res.status(400).json({error:'Passwords must match and be between 12 and 128 characters.'});
  const connection=await pool.getConnection();
  try{
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[tokenHash(token)]);
    if(!rows.length){await connection.rollback();return res.status(400).json({error:'This reset link is invalid or expired.'});}
    const reset=rows[0];const hash=await argon2.hash(password);
    await connection.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,reset.user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL',[reset.user_id]);
    await connection.execute("DELETE FROM app_sessions WHERE JSON_UNQUOTE(JSON_EXTRACT(session_data,'$.userId'))=?",[String(reset.user_id)]);
    await connection.commit();res.json({message:'Password updated. Sign in with your new password.'});
  }catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

router.post('/verify-email', verificationLimiter, async (req, res, next) => {
  const token = cleanString(req.body.token);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ error: 'This verification link is invalid or expired.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.execute(
      'SELECT id, user_id FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE',
      [tokenHash(token)]
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'This verification link is invalid or expired.' });
    }
    const verification = tokens[0];
    await connection.execute('UPDATE email_verification_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?', [verification.id]);
    await connection.execute(
      'UPDATE users SET status = ?, email_verified_at = UTC_TIMESTAMP() WHERE id = ? AND status = ?',
      ['active', verification.user_id, 'pending_email']
    );
    await connection.execute(
      'INSERT IGNORE INTO notification_preferences (user_id) VALUES (?)',
      [verification.user_id]
    );
    await connection.commit();
    return res.json({ message: 'Email verified. You can now sign in.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  const admissionNumber = cleanString(req.body.admissionNumber);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!admissionNumber.startsWith('SB62/')) return res.status(400).json({ error: 'Admission numbers must begin with SB62/.' });
  if (!password || password.length > 128) return res.status(401).json({ error: genericLoginError });

  try {
    const [rows] = await pool.execute(
      'SELECT id, full_name, role, status, email_verified_at, admin_approved_at, password_hash FROM users WHERE admission_number = ? LIMIT 1',
      [admissionNumber]
    );
    const user = rows[0];
    const hash = user ? user.password_hash : await dummyHashPromise;
    let passwordMatches = false;
    try { passwordMatches = await argon2.verify(hash, password); } catch { passwordMatches = false; }
    if (!user || !passwordMatches || user.status !== 'active' || (!user.email_verified_at && !user.admin_approved_at)) {
      return res.status(401).json({ error: genericLoginError });
    }
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.csrfToken = randomBytes(32).toString('base64url');
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    return res.json({
      message: 'Signed in.',
      csrfToken: req.session.csrfToken,
      redirect: user.role === 'admin' ? '/admin' : '/student',
    });
  } catch (error) { next(error); }
});

router.post('/admin-login', adminLoginLimiter, async (req, res, next) => {
  const email = cleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password || password.length > 128) return res.status(401).json({ error: genericLoginError });
  try {
    const [rows] = await pool.execute('SELECT id, full_name, role, status, email_verified_at, admin_approved_at, password_hash FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'admin']);
    const user = rows[0];
    const hash = user ? user.password_hash : await dummyHashPromise;
    let passwordMatches = false;
    try { passwordMatches = await argon2.verify(hash, password); } catch { passwordMatches = false; }
    if (!user || !passwordMatches || user.status !== 'active' || !user.email_verified_at) return res.status(401).json({ error: genericLoginError });
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.csrfToken = randomBytes(32).toString('base64url');
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    return res.json({ message: 'Signed in.', csrfToken: req.session.csrfToken, redirect: '/admin' });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    fullName: req.user.full_name,
    email: req.user.email,
    role: req.user.role,
  });
});

router.post('/logout', async (req, res) => {
  if (!req.session) return res.json({ message: 'Signed out.' });
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie(process.env.NODE_ENV === 'production' ? '__Host-class-sphere.sid' : 'class-sphere.sid', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Signed out.' });
});

module.exports = router;
