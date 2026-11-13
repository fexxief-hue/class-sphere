const express = require('express');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createTransport, isConfigured } = require('../services/mail');
const multer = require('multer');
const storage = require('../services/storage');
const ai = require('../services/ai');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function audit(actorId, action, entityType, entityId = null, context = {}) {
  return pool.execute(
    'INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,context_json) VALUES (?,?,?,?,?)',
    [actorId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(context)]
  );
}
function validDay(value) {
  return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(value);
}
function validTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function parsedDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}


router.get('/site-settings',async(_req,res,next)=>{try{const [rows]=await pool.execute("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('background_image_key','background_tint')");const settings=Object.fromEntries(rows.map(x=>[x.setting_key,x.setting_value]));res.json({settings:{background_tint:settings.background_tint,hasBackground:Boolean(settings.background_image_key)}});}catch(error){next(error);}});
router.post('/site-settings/background',upload.single('backgroundFile'),async(req,res,next)=>{try{const tint=req.body.overlayColor;if(!/^#[0-9a-f]{6}$/i.test(tint||''))return res.status(400).json({error:'Choose a valid overlay tint.'});let key=null;if(req.file){const {fileTypeFromBuffer}=await import('file-type');const detected=await fileTypeFromBuffer(req.file.buffer);if(!detected||!['image/jpeg','image/png','image/webp'].includes(detected.mime))return res.status(400).json({error:'Choose a JPEG, PNG or WebP image.'});key=await storage.save(req.file.buffer,detected.ext);await pool.execute("INSERT INTO site_settings(setting_key,setting_value,updated_by) VALUES('background_image_key',?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)",[key,req.user.id]);}await pool.execute("INSERT INTO site_settings(setting_key,setting_value,updated_by) VALUES('background_tint',?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)",[tint,req.user.id]);await audit(req.user.id,'site.background.upload','site_settings',null);res.status(201).json({message:'Background saved from your files.',imageUrl:'/api/public/site-background'});}catch(error){next(error);}});
router.delete('/site-settings/background',async(req,res,next)=>{try{await pool.execute("UPDATE site_settings SET setting_value='',updated_by=? WHERE setting_key='background_image_key'",[req.user.id]);await audit(req.user.id,'site.background.remove','site_settings',null);res.json({message:'Custom background removed.'});}catch(error){next(error);}});


router.get('/overview', async (_req, res, next) => {
  try {
    const queries = await Promise.all([
      pool.execute("SELECT COUNT(*) AS total FROM users WHERE role='student'"),
      pool.execute("SELECT COUNT(*) AS total FROM users WHERE role='student' AND status='pending_email'"),
      pool.execute("SELECT COUNT(*) AS total FROM announcements WHERE status='published'"),
      pool.execute('SELECT COUNT(*) AS total FROM resources'),
      pool.execute("SELECT COUNT(*) AS total FROM events WHERE status='published' AND starts_at >= UTC_TIMESTAMP()"),
      pool.execute("SELECT COUNT(*) AS total FROM email_recipients WHERE status IN ('sent','delivered')"),
      pool.execute("SELECT status,COUNT(*) AS total FROM users WHERE role='student' GROUP BY status"),
    ]);
    res.json({
      students: Number(queries[0][0][0].total),
      pendingEmailVerification: Number(queries[1][0][0].total),
      publishedAnnouncements: Number(queries[2][0][0].total),
      resources: Number(queries[3][0][0].total),
      upcomingEvents: Number(queries[4][0][0].total),
      acceptedEmails: Number(queries[5][0][0].total),
      studentStatuses: Object.fromEntries(queries[6][0].map((row) => [row.status, Number(row.total)])),
    });
  } catch (error) { next(error); }
});

router.get('/students', async (req, res, next) => {
  const search = text(req.query.search, 100);
  try {
    const pattern = '%' + search + '%';
    const [rows] = await pool.execute(
      "SELECT id, full_name AS fullName, admission_number AS admissionNumber, email, status, email_verified_at AS emailVerifiedAt, admin_approved_at AS adminApprovedAt, directory_public AS directoryPublic, nonessential_email_consent_at AS nonessentialEmailConsentAt, email_unsubscribed_at AS emailUnsubscribedAt FROM users WHERE role='student' AND (full_name LIKE ? OR admission_number LIKE ? OR email LIKE ?) ORDER BY full_name LIMIT 250",
      [pattern, pattern, pattern]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ students: rows });
  } catch (error) { next(error); }
});

router.patch('/students/:id', async (req, res, next) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid student.' });
  const { status, directoryPublic, publicDisplayName } = req.body || {};
  if (!['active','suspended'].includes(status) || typeof directoryPublic !== 'boolean') {
    return res.status(400).json({ error: 'Choose a valid account status and directory setting.' });
  }
  const displayName = publicDisplayName == null ? null : text(publicDisplayName, 120);
  if (directoryPublic && !displayName) return res.status(400).json({ error: 'Enter the approved name to display in the public directory.' });
  try {
    const [result] = await pool.execute(
      "UPDATE users SET status=?, directory_public=?, public_display_name=?, admin_approved_at=IF(email_verified_at IS NULL AND ?='active',COALESCE(admin_approved_at,UTC_TIMESTAMP()),admin_approved_at) WHERE id=? AND role='student'",
      [status, directoryPublic, directoryPublic ? displayName : null, status, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Student not found.' });
    if(status==='active')await pool.execute('INSERT IGNORE INTO notification_preferences(user_id) VALUES(?)',[id]);
    await audit(req.user.id, 'student.update', 'user', id, { status, directoryPublic });
    res.json({ message: 'Student settings saved.' });
  } catch (error) { next(error); }
});

router.get('/academics', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT y.id AS yearId,y.year_number AS year,y.label AS yearLabel,s.id AS semesterId,s.semester_number AS semester,u.id AS unitId,u.code,u.name,u.description FROM academic_years y LEFT JOIN semesters s ON s.academic_year_id=y.id LEFT JOIN units u ON u.semester_id=s.id ORDER BY y.year_number,s.semester_number,u.code'
    );
    res.json({ records: rows });
  } catch (error) { next(error); }
});

router.post('/academic-years', async (req, res, next) => {
  const yearNumber = Number(req.body.yearNumber);
  if (!Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 12) return res.status(400).json({ error: 'Academic year must be a number from 1 to 12.' });
  try {
    await pool.execute('INSERT INTO academic_years (year_number,label) VALUES (?,?)', [yearNumber, 'Year ' + yearNumber]);
    await audit(req.user.id, 'academic-year.create', 'academic_year', yearNumber);
    res.status(201).json({ message: 'Academic year created.' });
  } catch (error) { next(error); }
});

router.post('/academic-years/:yearId/semesters', async (req, res, next) => {
  const yearId = positiveId(req.params.yearId);
  const semesterNumber = Number(req.body.semesterNumber);
  if (!yearId || ![1,2].includes(semesterNumber)) return res.status(400).json({ error: 'Choose a valid year and semester.' });
  try {
    const [result] = await pool.execute(
      'INSERT INTO semesters (academic_year_id,semester_number) SELECT id,? FROM academic_years WHERE id=?',
      [semesterNumber, yearId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Academic year not found.' });
    await audit(req.user.id, 'semester.create', 'semester', result.insertId, { yearId, semesterNumber });
    res.status(201).json({ message: 'Semester created.' });
  } catch (error) { next(error); }
});

router.post('/units', async (req, res, next) => {
  const semesterId = positiveId(req.body.semesterId);
  const code = text(req.body.code,20).toUpperCase();
  const name = text(req.body.name,180);
  const description = text(req.body.description,10000) || null;
  if (!semesterId || !/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(code) || name.length < 2) return res.status(400).json({ error: 'Enter a semester, valid unit code and unit name.' });
  try {
    const [result] = await pool.execute('INSERT INTO units (semester_id,code,name,description) VALUES (?,?,?,?)',[semesterId,code,name,description]);
    await audit(req.user.id,'unit.create','unit',result.insertId,{code});
    res.status(201).json({ id: result.insertId, message: 'Unit added.' });
  } catch(error){next(error);}
});

router.put('/units/:id', async (req,res,next)=>{
  const id=positiveId(req.params.id);
  const semesterId=positiveId(req.body.semesterId);
  const code=text(req.body.code,20).toUpperCase();
  const name=text(req.body.name,180);
  const description=text(req.body.description,10000)||null;
  if(!id||!semesterId||!/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(code)||name.length<2)return res.status(400).json({error:'Enter a valid unit code, name and semester.'});
  try{
    const [result]=await pool.execute('UPDATE units SET semester_id=?,code=?,name=?,description=? WHERE id=?',[semesterId,code,name,description,id]);
    if(!result.affectedRows)return res.status(404).json({error:'Unit not found.'});
    await audit(req.user.id,'unit.update','unit',id,{code});
    res.json({message:'Unit updated.'});
  }catch(error){next(error);}
});

async function getTimetable(req,res,next){
  try{
    const [rows]=await pool.execute(
      "SELECT t.id,t.day_of_week AS day,TIME_FORMAT(t.starts_at,'%H:%i') AS startsAt,TIME_FORMAT(t.ends_at,'%H:%i') AS endsAt,u.id AS unitId,u.code,u.name,y.year_number AS year,s.semester_number AS semester,l.display_name AS lecturer,t.venue,t.class_type AS classType FROM timetable_entries t JOIN units u ON u.id=t.unit_id JOIN semesters s ON s.id=u.semester_id JOIN academic_years y ON y.id=s.academic_year_id LEFT JOIN lecturers l ON l.id=t.lecturer_id ORDER BY y.year_number,s.semester_number,FIELD(t.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),t.starts_at"
    );
    res.json({entries:rows});
  }catch(error){next(error);}
}
router.get('/timetable',getTimetable);

async function validateTimetable(req,res){
  const day=req.body.day;
  const startsAt=req.body.startsAt;
  const endsAt=req.body.endsAt;
  const unitId=positiveId(req.body.unitId);
  const lecturer=text(req.body.lecturer,120)||null;
  const venue=text(req.body.venue,80)||null;
  const classType=req.body.classType===''||req.body.classType==null?null:req.body.classType;
  if(!unitId||!validDay(day)||!validTime(startsAt)||!validTime(endsAt)||endsAt<=startsAt||!['theory','practical',null].includes(classType)){
    res.status(400).json({error:'Enter a valid day, time range, unit and class type.'});return null;
  }
  const [units]=await pool.execute('SELECT id FROM units WHERE id=?',[unitId]);
  if(!units.length){res.status(400).json({error:'Choose a unit from the academic catalogue.'});return null;}
  let lecturerId=null;
  if(lecturer){
    await pool.execute('INSERT IGNORE INTO lecturers (display_name) VALUES (?)',[lecturer]);
    const [lecturers]=await pool.execute('SELECT id FROM lecturers WHERE display_name=?',[lecturer]);
    lecturerId=lecturers[0].id;
  }
  return {day,startsAt,endsAt,unitId,lecturerId,venue,classType};
}

router.post('/timetable',async(req,res,next)=>{
  try{
    const record=await validateTimetable(req,res);if(!record)return;
    const [result]=await pool.execute('INSERT INTO timetable_entries (unit_id,day_of_week,starts_at,ends_at,lecturer_id,venue,class_type,source_label) VALUES (?,?,?,?,?,?,?,?)',[record.unitId,record.day,record.startsAt,record.endsAt,record.lecturerId,record.venue,record.classType,'Administrator update']);
    await audit(req.user.id,'timetable.create','timetable_entry',result.insertId);
    res.status(201).json({message:'Timetable entry added.'});
  }catch(error){next(error);}
});
router.put('/timetable/:id',async(req,res,next)=>{
  const id=positiveId(req.params.id);if(!id)return res.status(400).json({error:'Invalid timetable entry.'});
  try{
    const record=await validateTimetable(req,res);if(!record)return;
    const [result]=await pool.execute('UPDATE timetable_entries SET unit_id=?,day_of_week=?,starts_at=?,ends_at=?,lecturer_id=?,venue=?,class_type=? WHERE id=?',[record.unitId,record.day,record.startsAt,record.endsAt,record.lecturerId,record.venue,record.classType,id]);
    if(!result.affectedRows)return res.status(404).json({error:'Timetable entry not found.'});
    await audit(req.user.id,'timetable.update','timetable_entry',id);
    res.json({message:'Timetable entry updated.'});
  }catch(error){next(error);}
});
router.delete('/timetable/:id',async(req,res,next)=>{
  const id=positiveId(req.params.id);if(!id)return res.status(400).json({error:'Invalid timetable entry.'});
  try{
    const [result]=await pool.execute('DELETE FROM timetable_entries WHERE id=?',[id]);
    if(!result.affectedRows)return res.status(404).json({error:'Timetable entry not found.'});
    await audit(req.user.id,'timetable.delete','timetable_entry',id);
    res.json({message:'Timetable entry removed.'});
  }catch(error){next(error);}
});

router.get('/announcements',async(_req,res,next)=>{
  try{const [rows]=await pool.execute('SELECT id,title,body,category,audience,priority,status,published_at AS publishedAt,created_at AS createdAt FROM announcements ORDER BY created_at DESC LIMIT 200');res.json({announcements:rows});}
  catch(error){next(error);}
});
router.post('/announcements',async(req,res,next)=>{
  const title=text(req.body.title,200),body=text(req.body.body,50000);
  const category=req.body.category,audience=req.body.audience||'students',priority=req.body.priority||'normal';
  if(title.length<2||body.length<2||!['academic','timetable','event','general'].includes(category)||!['students','public'].includes(audience)||!['normal','urgent'].includes(priority))return res.status(400).json({error:'Enter a title, message and valid announcement settings.'});
  try{
    const [result]=await pool.execute('INSERT INTO announcements (title,body,category,audience,priority,status,author_id) VALUES (?,?,?,?,?,?,?)',[title,body,category,audience,priority,'draft',req.user.id]);
    await audit(req.user.id,'announcement.create','announcement',result.insertId,{category,audience,priority});
    res.status(201).json({id:result.insertId,message:'Announcement saved as a draft.'});
  }catch(error){next(error);}
});
router.put('/announcements/:id',async(req,res,next)=>{
  const id=positiveId(req.params.id);const title=text(req.body.title,200),body=text(req.body.body,50000);
  const category=req.body.category,audience=req.body.audience,priority=req.body.priority;
  if(!id||title.length<2||body.length<2||!['academic','timetable','event','general'].includes(category)||!['students','public'].includes(audience)||!['normal','urgent'].includes(priority))return res.status(400).json({error:'Enter valid announcement details.'});
  try{
    const [result]=await pool.execute('UPDATE announcements SET title=?,body=?,category=?,audience=?,priority=? WHERE id=? AND status=?',[title,body,category,audience,priority,id,'draft']);
    if(!result.affectedRows)return res.status(404).json({error:'Draft not found.'});
    await audit(req.user.id,'announcement.update','announcement',id);
    res.json({message:'Draft updated.'});
  }catch(error){next(error);}
});
router.post('/announcements/:id/publish',async(req,res,next)=>{
  const id=positiveId(req.params.id);if(!id)return res.status(400).json({error:'Invalid announcement.'});
  const connection=await pool.getConnection();
  try{
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT id,title,body,category,audience,priority,status FROM announcements WHERE id=? FOR UPDATE',[id]);
    const item=rows[0];if(!item||item.status!=='draft'){await connection.rollback();return res.status(404).json({error:'Draft not found.'});}
    await connection.execute('UPDATE announcements SET status=?,published_at=UTC_TIMESTAMP() WHERE id=?',['published',id]);
    if(item.audience==='students'){
      await connection.execute('INSERT INTO notifications (user_id,announcement_id,category,priority,title,body) SELECT id,?,?,?,?,? FROM users WHERE role=? AND status=? AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL)',[id,item.category,item.priority,item.title,item.body,'student','active']);
    }
    await connection.commit();
    await audit(req.user.id,'announcement.publish','announcement',id,{audience:item.audience});
    res.json({message:'Announcement published.'});
  }catch(error){await connection.rollback();next(error);}finally{connection.release();}
});
router.post('/announcements/:id/archive',async(req,res,next)=>{
  const id=positiveId(req.params.id);if(!id)return res.status(400).json({error:'Invalid announcement.'});
  try{const [result]=await pool.execute('UPDATE announcements SET status=? WHERE id=? AND status=?',['archived',id,'published']);if(!result.affectedRows)return res.status(404).json({error:'Published announcement not found.'});await audit(req.user.id,'announcement.archive','announcement',id);res.json({message:'Announcement archived.'});}
  catch(error){next(error);}
});

router.get('/events',async(_req,res,next)=>{
  try{const [rows]=await pool.execute('SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,ends_at AS endsAt,venue,status FROM events ORDER BY starts_at DESC LIMIT 200');res.json({events:rows});}
  catch(error){next(error);}
});
router.post('/events',async(req,res,next)=>{
  const title=text(req.body.title,200),eventType=req.body.eventType||'event',description=text(req.body.description,10000),startsAt=parsedDateTime(req.body.startsAt),endsAt=req.body.endsAt?parsedDateTime(req.body.endsAt):null,venue=text(req.body.venue,160)||null;
  if(!['event','cat','exam'].includes(eventType)||title.length<2||description.length<2||!startsAt||(req.body.endsAt&&!endsAt)||(endsAt&&endsAt<=startsAt))return res.status(400).json({error:'Enter a title, description and valid event times.'});
  const connection=await pool.getConnection();
  try{await connection.beginTransaction();const [result]=await connection.execute('INSERT INTO events (title,description,event_type,starts_at,ends_at,venue,created_by) VALUES (?,?,?,?,?,?,?)',[title,description,eventType,startsAt,endsAt,venue,req.user.id]);await connection.execute('INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,context_json) VALUES (?,?,?,?,?)',[req.user.id,'event.create','event',String(result.insertId),JSON.stringify({eventType})]);await connection.commit();res.status(201).json({id:result.insertId,message:'Event saved as a draft.'});}
  catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

router.post('/events/:id/publish',async(req,res,next)=>{
  const id=positiveId(req.params.id);if(!id)return res.status(400).json({error:'Invalid event.'});
  const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.execute('SELECT id,title,description,event_type,starts_at,venue,status FROM events WHERE id=? FOR UPDATE',[id]);const event=rows[0];if(!event||event.status!=='draft'){await connection.rollback();return res.status(404).json({error:'Event draft not found.'});}await connection.execute('UPDATE events SET status=? WHERE id=?',['published',id]);await connection.execute("INSERT INTO notifications (user_id,announcement_id,category,priority,title,body) SELECT id,NULL,'event','normal',?,? FROM users WHERE role='student' AND status='active' AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL)",[event.title,event.description]);await connection.execute('INSERT INTO audit_logs (actor_id,action,entity_type,entity_id,context_json) VALUES (?,?,?,?,?)',[req.user.id,'event.publish','event',String(id),JSON.stringify({eventType:event.event_type})]);await connection.commit();res.json({message:'Event published and student notices created.'});}catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

router.get('/contacts',async(req,res,next)=>{try{const status=['new','reviewed','closed'].includes(req.query.status)?req.query.status:'new';const [rows]=await pool.execute('SELECT id,sender_name AS name,sender_email AS email,subject,message,status,created_at AS createdAt FROM contact_messages WHERE status=? ORDER BY created_at DESC LIMIT 200',[status]);res.set('Cache-Control','no-store');res.json({messages:rows});}catch(error){next(error);}});
router.patch('/contacts/:id',async(req,res,next)=>{const id=positiveId(req.params.id);const status=req.body.status;if(!id||!['new','reviewed','closed'].includes(status))return res.status(400).json({error:'Choose a valid contact status.'});try{const [r]=await pool.execute('UPDATE contact_messages SET status=? WHERE id=?',[status,id]);if(!r.affectedRows)return res.status(404).json({error:'Contact message not found.'});await audit(req.user.id,'contact.update','contact_message',id,{status});res.json({message:'Contact status updated.'});}catch(error){next(error);}});
router.post('/ai/announcement-draft',async(req,res,next)=>{const prompt=text(req.body.prompt,4000);if(prompt.length<8)return res.status(400).json({error:'Describe the announcement in at least 8 characters.'});try{const result=await ai.draftAnnouncement(prompt);const d=result.draft;const [saved]=await pool.execute('INSERT INTO ai_announcement_drafts (prompt,title,body,funny_version,professional_version,whatsapp_version,provider,model,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[prompt,d.title,d.body,d.funnyVersion,d.professionalVersion,d.whatsappVersion,'openai',result.model,req.user.id]);await audit(req.user.id,'ai.announcement.draft','ai_announcement_draft',saved.insertId,{model:result.model});res.json({id:saved.insertId,...d});}catch(error){if(error.code==='AI_NOT_CONFIGURED')return res.status(503).json({error:error.message});next(error);}});
router.post('/resources',upload.single('file'),async(req,res,next)=>{try{const unitId=positiveId(req.body.unitId),title=text(req.body.title,200),type=req.body.resourceType,visibility=req.body.visibility==='public'?'public':'students';if(!req.file||!unitId||title.length<2||!['lecture_notes','past_paper','assignment','practical','cat','other'].includes(type))return res.status(400).json({error:'Choose a unit, title, resource type and file.'});const {fileTypeFromBuffer}=await import('file-type');const detected=await fileTypeFromBuffer(req.file.buffer);const allowed={pdf:'pdf',docx:'docx',pptx:'pptx',xlsx:'xlsx'};const ext=path.extname(req.file.originalname).slice(1).toLowerCase();if(!detected||allowed[ext]!==detected.ext)return res.status(400).json({error:'Upload a valid PDF, DOCX, PPTX or XLSX file.'});const [units]=await pool.execute('SELECT id FROM units WHERE id=?',[unitId]);if(!units.length)return res.status(400).json({error:'Choose a unit from the catalogue.'});const key=await storage.save(req.file.buffer,detected.ext);const [saved]=await pool.execute('INSERT INTO resources (unit_id,title,resource_type,storage_key,original_filename,mime_type,file_size_bytes,uploaded_by,visibility) VALUES (?,?,?,?,?,?,?,?,?)',[unitId,title,type,key,path.basename(req.file.originalname).slice(0,255),detected.mime,req.file.size,req.user.id,visibility]);await audit(req.user.id,'resource.upload','resource',saved.insertId,{visibility});res.status(201).json({id:saved.insertId,message:'Resource uploaded to private storage.'});}catch(error){next(error);}});
router.post('/gallery',upload.single('file'),async(req,res,next)=>{try{const title=text(req.body.title,200),alt=text(req.body.altText,200),description=text(req.body.description,2000)||null,category=text(req.body.category,80)||null,permission=req.body.permissionConfirmed==='true';if(!req.file||title.length<2||alt.length<3||!permission)return res.status(400).json({error:'Add an image, title, alt text, and confirm permission to publish it.'});const {fileTypeFromBuffer}=await import('file-type');const detected=await fileTypeFromBuffer(req.file.buffer);if(!detected||!['image/jpeg','image/png','image/webp'].includes(detected.mime))return res.status(400).json({error:'Upload a JPEG, PNG or WebP image.'});const key=await storage.save(req.file.buffer,detected.ext);const [saved]=await pool.execute('INSERT INTO gallery_items (title,description,category,storage_key,alt_text,permission_confirmed,status,uploaded_by) VALUES (?,?,?,?,?,?,?,?)',[title,description,category,key,alt,true,'draft',req.user.id]);await audit(req.user.id,'gallery.upload','gallery_item',saved.insertId);res.status(201).json({id:saved.insertId,message:'Photo uploaded as a draft.'});}catch(error){next(error);}});
router.patch('/gallery/:id',async(req,res,next)=>{const id=positiveId(req.params.id),status=req.body.status;if(!id||!['published','archived','draft'].includes(status))return res.status(400).json({error:'Choose a valid gallery status.'});try{const [r]=await pool.execute('UPDATE gallery_items SET status=? WHERE id=? AND (permission_confirmed=TRUE OR ?<>?)',[status,id,status,'published']);if(!r.affectedRows)return res.status(404).json({error:'Gallery item not found or permission is not confirmed.'});await audit(req.user.id,'gallery.status','gallery_item',id,{status});res.json({message:'Gallery item updated.'});}catch(error){next(error);}});
router.get('/resources/:id/download',async(req,res,next)=>{const id=positiveId(req.params.id);if(!id)return res.status(400).end();try{const [rows]=await pool.execute('SELECT storage_key,original_filename,mime_type FROM resources WHERE id=?',[id]);if(!rows.length)return res.status(404).json({error:'Resource not found.'});const bytes=await storage.read(rows[0].storage_key);res.set('Content-Type',rows[0].mime_type);res.set('Content-Disposition',`attachment; filename="${rows[0].original_filename.replace(/["\\\r\n]/g,'_')}"`);res.set('X-Content-Type-Options','nosniff').send(bytes);}catch(error){next(error);}});

router.patch('/resources/:id',async(req,res,next)=>{const id=positiveId(req.params.id),approvalStatus=req.body.approvalStatus;if(!id||!['approved','rejected'].includes(approvalStatus))return res.status(400).json({error:'Choose approved or rejected.'});try{const [result]=await pool.execute('UPDATE resources SET approval_status=? WHERE id=?',[approvalStatus,id]);if(!result.affectedRows)return res.status(404).json({error:'Resource not found.'});await audit(req.user.id,'resource.review','resource',id,{approvalStatus});res.json({message:'Resource review saved.'});}catch(error){next(error);}});
router.get('/resources',async(_req,res,next)=>{
  try{const [rows]=await pool.execute('SELECT r.id,r.title,r.resource_type AS resourceType,r.original_filename AS filename,r.mime_type AS mimeType,r.file_size_bytes AS fileSize,r.approval_status AS approvalStatus,u.code,u.name FROM resources r JOIN units u ON u.id=r.unit_id ORDER BY r.created_at DESC LIMIT 500');res.json({resources:rows});}
  catch(error){next(error);}
});
router.get('/gallery',async(_req,res,next)=>{
  try{const [rows]=await pool.execute('SELECT id,title,description,category,alt_text AS altText,permission_confirmed AS permissionConfirmed,status,created_at AS createdAt FROM gallery_items ORDER BY created_at DESC LIMIT 500');res.json({items:rows});}
  catch(error){next(error);}
});

router.get('/email/recipients',async(_req,res,next)=>{
  try{
    const [rows]=await pool.execute("SELECT id,full_name AS fullName,admission_number AS admissionNumber,email,email_verified_at AS emailVerifiedAt,admin_approved_at AS adminApprovedAt,nonessential_email_consent_at AS nonessentialEmailConsentAt,email_unsubscribed_at AS emailUnsubscribedAt FROM users WHERE role='student' AND status='active' AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL) ORDER BY full_name");
    res.set('Cache-Control','no-store');res.json({recipients:rows});
  }catch(error){next(error);}
});

router.get('/email/history',async(_req,res,next)=>{
  try{
    const [rows]=await pool.execute("SELECT c.id,c.subject,c.category,c.created_at AS createdAt,u.full_name AS sender,COUNT(r.id) AS recipientCount,SUM(r.status IN ('sent','delivered')) AS acceptedCount,SUM(r.status='failed') AS failedCount FROM email_campaigns c JOIN users u ON u.id=c.created_by LEFT JOIN email_recipients r ON r.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100");
    res.json({campaigns:rows});
  }catch(error){next(error);}
});

router.post('/email/test',async(req,res,next)=>{
  const subject=text(req.body.subject,250),body=text(req.body.body,50000);
  if(subject.length<2||body.length<1)return res.status(400).json({error:'Enter a subject and message.'});
  if(!isConfigured())return res.status(503).json({error:'Email provider is not configured.'});
  try{
    const transport=createTransport();
    await transport.sendMail({from:process.env.SMTP_FROM,to:req.user.email,subject:'[CLASS SPHERE TEST] '+subject,text:body});
    await audit(req.user.id,'email.test','user',req.user.id);
    res.json({message:'Test email accepted by the configured provider.'});
  }catch(error){next(error);}
});

router.post('/email/send',async(req,res,next)=>{
  const subject=text(req.body.subject,250),body=text(req.body.body,50000),category=req.body.category;
  const recipientIds=Array.isArray(req.body.recipientIds)?[...new Set(req.body.recipientIds.map(Number))]:[];
  const idempotencyKey=text(req.body.idempotencyKey,36);
  if(req.body.confirm!==true)return res.status(400).json({error:'Confirm the recipient count before sending.'});
  if(subject.length<2||body.length<1||!['essential','nonessential'].includes(category)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return res.status(400).json({error:'Enter a subject, message, category and valid send confirmation.'});
  if(!recipientIds.length||recipientIds.length>100||recipientIds.some((id)=>!Number.isSafeInteger(id)||id<1))return res.status(400).json({error:'Select between 1 and 100 recipients.'});
  if(!isConfigured())return res.status(503).json({error:'Email provider is not configured.'});
  if(category==='nonessential'&&!process.env.APP_BASE_URL)return res.status(503).json({error:'Unsubscribe link configuration is missing.'});
  try{
    const placeholders=recipientIds.map(()=>'?').join(',');
    const [users]=await pool.execute('SELECT id,full_name AS fullName,email,nonessential_email_consent_at AS consent,email_unsubscribed_at AS unsubscribed FROM users WHERE role=? AND status=? AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL) AND id IN ('+placeholders+')',['student','active',...recipientIds]);
    const eligible=category==='essential'?users:users.filter((user)=>user.consent&&!user.unsubscribed);
    if(eligible.length!==recipientIds.length)return res.status(400).json({error:'One or more selected recipients are not eligible for this message.'});
    const [previous]=await pool.execute('SELECT id,subject,body,category FROM email_campaigns WHERE created_by=? AND idempotency_key=?',[req.user.id,idempotencyKey]);
    let campaignId;
    if(previous.length){
      if(previous[0].subject!==subject||previous[0].body!==body||previous[0].category!==category)return res.status(409).json({error:'This confirmation key was already used for a different message.'});
      campaignId=previous[0].id;
      const [sentRows]=await pool.execute('SELECT user_id AS userId FROM email_recipients WHERE campaign_id=?',[campaignId]);
      if(sentRows.length!==recipientIds.length||sentRows.some((row)=>!recipientIds.includes(Number(row.userId))))return res.status(409).json({error:'This send confirmation does not match the existing campaign.'});
      const [results]=await pool.execute('SELECT full_name AS fullName,recipient_email AS email,status,error_summary AS error FROM email_recipients r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? ORDER BY u.full_name',[campaignId]);
      return res.json({campaignId,results,replayed:true});
    }
    const connection=await pool.getConnection();
    try{
      await connection.beginTransaction();
      const [campaign]=await connection.execute('INSERT INTO email_campaigns (subject,body,category,idempotency_key,created_by,confirmed_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())',[subject,body,category,idempotencyKey,req.user.id]);
      campaignId=campaign.insertId;
      for(const user of eligible)await connection.execute('INSERT INTO email_recipients (campaign_id,user_id,recipient_email,status) VALUES (?,?,?,?)',[campaignId,user.id,user.email,'queued']);
      await connection.commit();
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
    const transport=createTransport();
    const results=[];
    for(const user of eligible){
      try{
        let message=body;
        if(category==='nonessential'){
          const rawToken=randomBytes(32).toString('base64url');
          await pool.execute('INSERT INTO email_unsubscribe_tokens (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 YEAR))',[user.id,createHash('sha256').update(rawToken).digest('hex')]);
          const link=process.env.APP_BASE_URL.replace(/\/$/,'')+'/unsubscribe.html?token='+encodeURIComponent(rawToken);
          message+='\n\nTo stop non-essential CLASS SPHERE emails, use: '+link;
        }
        const sent=await transport.sendMail({from:process.env.SMTP_FROM,to:user.email,subject,text:message});
        await pool.execute('UPDATE email_recipients SET status=?,provider_message_id=?,attempted_at=UTC_TIMESTAMP() WHERE campaign_id=? AND user_id=?',['sent',sent.messageId||null,campaignId,user.id]);
        results.push({fullName:user.fullName,email:user.email,status:'sent'});
      }catch(error){
        await pool.execute('UPDATE email_recipients SET status=?,error_summary=?,attempted_at=UTC_TIMESTAMP() WHERE campaign_id=? AND user_id=?',['failed','Provider did not accept the message',campaignId,user.id]);
        results.push({fullName:user.fullName,email:user.email,status:'failed',error:'Provider did not accept the message'});
      }
    }
    await audit(req.user.id,'email.campaign.send','email_campaign',campaignId,{recipientCount:eligible.length,category});
    res.status(201).json({campaignId,results,replayed:false});
  }catch(error){next(error);}
});

module.exports = router;
