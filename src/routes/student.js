const express = require('express');
const path = require('node:path');
const multer = require('multer');
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
const pool = require('../db');
const storage = require('../services/storage');
const ai = require('../services/ai');
const { rateLimit } = require('express-rate-limit');
const aiLimiter = rateLimit({windowMs:60*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'AI request limit reached. Try again later.'}});
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('student'));

router.get('/academic-options', async (_req,res,next)=>{try{const [rows]=await pool.execute('SELECT y.year_number AS year,s.semester_number AS semester FROM academic_years y JOIN semesters s ON s.academic_year_id=y.id ORDER BY y.year_number,s.semester_number');res.set('Cache-Control','no-store').json({options:rows});}catch(error){next(error);}});
router.get('/academics', async (req,res,next)=>{const year=Number(req.query.year),semester=Number(req.query.semester);if(!Number.isInteger(year)||year<1||year>12||![1,2].includes(semester))return res.status(400).json({error:'Choose a valid year and semester.'});try{const [rows]=await pool.execute('SELECT u.id,u.code,u.name,u.description FROM units u JOIN semesters s ON s.id=u.semester_id JOIN academic_years y ON y.id=s.academic_year_id WHERE y.year_number=? AND s.semester_number=? ORDER BY u.code',[year,semester]);res.set('Cache-Control','no-store').json({units:rows,year,semester});}catch(error){next(error);}});


router.post('/ai/ask',aiLimiter,async(req,res,next)=>{const question=typeof req.body.question==='string'?req.body.question.trim().slice(0,5000):'';if(question.length<4)return res.status(400).json({error:'Enter a study question.'});try{res.json({answer:await ai.answerStudent(question),disclaimer:'AI study support. Check course and official university materials for authoritative guidance.'});}catch(error){if(error.code==='AI_NOT_CONFIGURED')return res.status(503).json({error:'The academic assistant is not configured. Ask an administrator about setup.'});next(error);}});
router.post('/resources',upload.single('file'),async(req,res,next)=>{try{const unitId=Number(req.body.unitId),title=typeof req.body.title==='string'?req.body.title.trim().slice(0,200):'',type=req.body.resourceType;if(!req.file||!Number.isSafeInteger(unitId)||unitId<1||title.length<2||!['lecture_notes','past_paper','assignment','practical','cat','other'].includes(type))return res.status(400).json({error:'Choose a unit, title, file type, and file.'});const {fileTypeFromBuffer}=await import('file-type');const detected=await fileTypeFromBuffer(req.file.buffer);const ext=path.extname(req.file.originalname).slice(1).toLowerCase();if(!detected||({pdf:'pdf',docx:'docx',pptx:'pptx',xlsx:'xlsx'})[ext]!==detected.ext)return res.status(400).json({error:'Use a valid PDF, DOCX, PPTX or XLSX file.'});const [units]=await pool.execute('SELECT id FROM units WHERE id=?',[unitId]);if(!units.length)return res.status(400).json({error:'Choose a listed unit.'});const key=await storage.save(req.file.buffer,detected.ext);await pool.execute('INSERT INTO resources (unit_id,title,resource_type,storage_key,original_filename,mime_type,file_size_bytes,uploaded_by,visibility,approval_status) VALUES (?,?,?,?,?,?,?,?,?,?)',[unitId,title,type,key,path.basename(req.file.originalname).slice(0,255),detected.mime,req.file.size,req.user.id,'students','pending']);res.status(201).json({message:'File submitted for administrator review.'});}catch(error){next(error);}});
router.get('/resources',async(_req,res,next)=>{try{const [rows]=await pool.execute("SELECT r.id,r.title,r.resource_type AS resourceType,r.original_filename AS filename,r.file_size_bytes AS fileSize,u.code,u.name FROM resources r JOIN units u ON u.id=r.unit_id WHERE (r.visibility='students' OR r.visibility='public') AND r.approval_status='approved' ORDER BY u.code,r.created_at DESC LIMIT 500");res.set('Cache-Control','private, no-store');res.json({resources:rows});}catch(error){next(error);}});
router.get('/resources/:id/download',async(req,res,next)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(404).end();try{const [rows]=await pool.execute("SELECT storage_key,original_filename,mime_type FROM resources WHERE id=? AND (visibility='students' OR visibility='public') AND approval_status='approved'",[id]);if(!rows.length)return res.status(404).json({error:'Resource not found.'});const bytes=await storage.read(rows[0].storage_key);res.set('Content-Type',rows[0].mime_type).set('Content-Disposition','attachment; filename="'+rows[0].original_filename.replace(/["\\\r\n]/g,'_')+'"').set('X-Content-Type-Options','nosniff').send(bytes);}catch(error){next(error);}});

router.get('/overview', async (req, res, next) => {
  try {
    const [schedule] = await pool.execute(
      "SELECT t.id, t.day_of_week AS day, TIME_FORMAT(t.starts_at, '%H:%i') AS startsAt, TIME_FORMAT(t.ends_at, '%H:%i') AS endsAt, u.code, u.name, l.display_name AS lecturer, t.venue, t.class_type AS classType FROM timetable_entries t JOIN units u ON u.id=t.unit_id JOIN semesters s ON s.id=u.semester_id JOIN academic_years y ON y.id=s.academic_year_id LEFT JOIN lecturers l ON l.id=t.lecturer_id WHERE y.year_number=3 AND s.semester_number=1 ORDER BY FIELD(t.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),t.starts_at"
    );
    const [events] = await pool.execute("SELECT id,title,event_type AS eventType,description,starts_at AS startsAt,venue FROM events WHERE status='published' AND starts_at>=UTC_TIMESTAMP() AND event_type IN ('cat','exam') ORDER BY starts_at LIMIT 10");
    const [announcements] = await pool.execute(
      "SELECT id, title, body, category, priority, published_at AS publishedAt FROM announcements WHERE status='published' AND audience='students' ORDER BY published_at DESC LIMIT 10"
    );
    const [notifications] = await pool.execute(
      'SELECT id, category, priority, title, body, read_at AS readAt, dismissed_at AS dismissedAt, snoozed_until AS snoozedUntil, created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    const [popupStates] = await pool.execute(
      'SELECT timetable_entry_id AS timetableEntryId, class_date AS classDate, dismissed_at AS dismissedAt, snoozed_until AS snoozedUntil FROM class_popup_states WHERE user_id=? AND class_date BETWEEN DATE_SUB(UTC_DATE(), INTERVAL 1 DAY) AND DATE_ADD(UTC_DATE(), INTERVAL 8 DAY)',
      [req.user.id]
    );
    const [preferences] = await pool.execute(
      'SELECT academic_enabled AS academic, timetable_enabled AS timetable, event_enabled AS event, general_enabled AS general, quiet_start AS quietStart, quiet_end AS quietEnd FROM notification_preferences WHERE user_id=? LIMIT 1',
      [req.user.id]
    );
    res.set('Cache-Control', 'no-store');
    res.json({
      student: { fullName: req.user.full_name },
      schedule,
      events,
      announcements,
      notifications,
      popupStates: popupStates.map((state) => ({ ...state, classDate: state.classDate instanceof Date ? state.classDate.toISOString().slice(0, 10) : String(state.classDate).slice(0, 10) })),
      preferences: preferences[0] ? { ...preferences[0], quietStart: preferences[0].quietStart ? String(preferences[0].quietStart).slice(0,5) : null, quietEnd: preferences[0].quietEnd ? String(preferences[0].quietEnd).slice(0,5) : null } : { academic: true, timetable: true, event: true, general: true },
      timezone: 'Africa/Nairobi',
    });
  } catch (error) { next(error); }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, category, title, body, read_at AS readAt, dismissed_at AS dismissedAt, snoozed_until AS snoozedUntil, created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ notifications: rows });
  } catch (error) { next(error); }
});

router.post('/notifications/:id/read', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid notification.' });
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET read_at=COALESCE(read_at, UTC_TIMESTAMP()) WHERE id=? AND user_id=?',
      [id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification marked as read.' });
  } catch (error) { next(error); }
});

router.post('/notifications/:id/snooze', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid notification.' });
  try {
    const [result] = await pool.execute('UPDATE notifications SET snoozed_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) WHERE id=? AND user_id=?', [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification snoozed for 15 minutes.' });
  } catch (error) { next(error); }
});

router.post('/notifications/:id/dismiss', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid notification.' });
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET dismissed_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?',
      [id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification dismissed.' });
  } catch (error) { next(error); }
});

async function saveClassPopupState(req, res, next, mode) {
  const entryId = Number(req.params.entryId);
  const classDate = typeof req.body.classDate === 'string' ? req.body.classDate : '';
  const parsed = new Date(classDate + 'T00:00:00.000Z');
  if (!Number.isSafeInteger(entryId) || entryId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(classDate) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== classDate) {
    return res.status(400).json({ error: 'Invalid class reminder.' });
  }
  try {
    const query = mode === 'dismiss'
      ? 'INSERT INTO class_popup_states (user_id,timetable_entry_id,class_date,dismissed_at,snoozed_until) SELECT ?,t.id,?,UTC_TIMESTAMP(),NULL FROM timetable_entries t JOIN units u ON u.id=t.unit_id JOIN semesters s ON s.id=u.semester_id JOIN academic_years y ON y.id=s.academic_year_id WHERE t.id=? AND y.year_number=3 AND s.semester_number=1 ON DUPLICATE KEY UPDATE dismissed_at=UTC_TIMESTAMP(),snoozed_until=NULL'
      : 'INSERT INTO class_popup_states (user_id,timetable_entry_id,class_date,dismissed_at,snoozed_until) SELECT ?,t.id,?,NULL,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) FROM timetable_entries t JOIN units u ON u.id=t.unit_id JOIN semesters s ON s.id=u.semester_id JOIN academic_years y ON y.id=s.academic_year_id WHERE t.id=? AND y.year_number=3 AND s.semester_number=1 ON DUPLICATE KEY UPDATE snoozed_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)';
    const [result] = await pool.execute(query, [req.user.id, classDate, entryId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Class entry not found.' });
    res.json({ message: mode === 'dismiss' ? 'Class reminder dismissed.' : 'Class reminder snoozed for 15 minutes.' });
  } catch (error) { next(error); }
}

router.post('/class-popup/:entryId/dismiss', (req, res, next) => saveClassPopupState(req, res, next, 'dismiss'));
router.post('/class-popup/:entryId/snooze', (req, res, next) => saveClassPopupState(req, res, next, 'snooze'));

router.put('/preferences', async (req, res, next) => {
  const body = req.body || {};
  const boolFields = ['academic', 'timetable', 'event', 'general'];
  if (boolFields.some((key) => typeof body[key] !== 'boolean')) return res.status(400).json({ error: 'Choose notification settings for each category.' });
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const quietStart = body.quietStart === '' || body.quietStart == null ? null : body.quietStart;
  const quietEnd = body.quietEnd === '' || body.quietEnd == null ? null : body.quietEnd;
  if ((quietStart && !timePattern.test(quietStart)) || (quietEnd && !timePattern.test(quietEnd)) || Boolean(quietStart) !== Boolean(quietEnd)) {
    return res.status(400).json({ error: 'Quiet hours need a valid start and end time.' });
  }
  try {
    await pool.execute(
      'INSERT INTO notification_preferences (user_id,academic_enabled,timetable_enabled,event_enabled,general_enabled,quiet_start,quiet_end) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE academic_enabled=VALUES(academic_enabled),timetable_enabled=VALUES(timetable_enabled),event_enabled=VALUES(event_enabled),general_enabled=VALUES(general_enabled),quiet_start=VALUES(quiet_start),quiet_end=VALUES(quiet_end)',
      [req.user.id, body.academic, body.timetable, body.event, body.general, quietStart, quietEnd]
    );
    res.json({ message: 'Notification preferences saved.' });
  } catch (error) { next(error); }
});

module.exports = router;
