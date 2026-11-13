require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const path = require('node:path');
const pool = require('./db');
const MySQLSessionStore = require('./session-store');
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const chatRoutes = require('./routes/chat');
const { requireAuth, requireRole } = require('./middleware/auth');
const { requireCsrf } = require('./middleware/csrf');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('replace_')) {
  throw new Error('Set SESSION_SECRET to a private random value of at least 32 characters.');
}
if (isProduction) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{imgSrc:["'self'",'data:','https:']}}}));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(session({
  name: isProduction ? '__Host-class-sphere.sid' : 'class-sphere.sid',
  secret: sessionSecret,
  store: new MySQLSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  },
}));
app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: isProduction ? '1h' : 0 }));
app.use('/api', requireCsrf);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

app.get('/student', requireAuth, requireRole('student'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'student.html'));
});
app.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/api/academics', async (req, res, next) => {
  const year = req.query.year == null ? null : Number(req.query.year);
  const semester = req.query.semester == null ? null : Number(req.query.semester);
  if ((year !== null && (!Number.isInteger(year) || year < 1 || year > 8)) || (semester !== null && ![1,2].includes(semester))) return res.status(400).json({error:'Choose a valid year and semester.'});
  try {
    const [rows] = await pool.execute('SELECT y.year_number AS year, s.semester_number AS semester, u.code, u.name FROM units u JOIN semesters s ON s.id = u.semester_id JOIN academic_years y ON y.id = s.academic_year_id WHERE (? IS NULL OR y.year_number=?) AND (? IS NULL OR s.semester_number=?) ORDER BY y.year_number, s.semester_number, u.code',[year,year,semester,semester]);
    res.json({ units: rows });
  } catch (error) { next(error); }
});

app.get('/api/public/timetable', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT t.day_of_week AS day, TIME_FORMAT(t.starts_at, '%H:%i') AS startsAt, TIME_FORMAT(t.ends_at, '%H:%i') AS endsAt, u.code, u.name, l.display_name AS lecturer, t.venue, t.class_type AS classType FROM timetable_entries t JOIN units u ON u.id = t.unit_id JOIN semesters s ON s.id = u.semester_id JOIN academic_years y ON y.id = s.academic_year_id LEFT JOIN lecturers l ON l.id = t.lecturer_id WHERE y.year_number = 3 AND s.semester_number = 1 ORDER BY FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), t.starts_at"
    );
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ entries: rows, timezone: 'Africa/Nairobi' });
  } catch (error) { next(error); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.code || 'INTERNAL_ERROR');
  if (res.headersSent) return;
  res.status(500).json({ error: 'The request could not be completed.' });
});

const server = app.listen(port, () => {
  console.log('CLASS SPHERE server listening on port ' + port);
});
module.exports = { app, server };
