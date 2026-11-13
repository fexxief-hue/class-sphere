const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { createHash } = require('node:crypto');
const pool = require('../db');
const storage = require('../services/storage');

const router = express.Router();
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 4,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messages were sent. Try again later.' },
});
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';



router.get('/resources',async(_req,res,next)=>{try{const [rows]=await pool.execute("SELECT r.id,r.title,r.resource_type AS resourceType,r.file_size_bytes AS fileSize,u.code,u.name FROM resources r JOIN units u ON u.id=r.unit_id WHERE r.visibility='public' ORDER BY u.code,r.created_at DESC LIMIT 200");res.json({resources:rows});}catch(error){next(error);}});
router.get('/resources/:id/download',async(req,res,next)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(404).end();try{const [rows]=await pool.execute("SELECT storage_key,original_filename,mime_type FROM resources WHERE id=? AND visibility='public'",[id]);if(!rows.length)return res.status(404).json({error:'Resource not found.'});const bytes=await storage.read(rows[0].storage_key);res.set('Content-Type',rows[0].mime_type).set('Content-Disposition','attachment; filename="'+rows[0].original_filename.replace(/["\\\r\n]/g,'_')+'"').set('X-Content-Type-Options','nosniff').send(bytes);}catch(error){next(error);}});

router.get('/gallery',async(_req,res,next)=>{try{const [items]=await pool.execute("SELECT id,title,alt_text AS altText FROM gallery_items WHERE status='published' AND permission_confirmed=TRUE ORDER BY created_at DESC LIMIT 100");res.json({items});}catch(error){next(error);}});
router.get('/gallery/:id/image',async(req,res,next)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(404).end();try{const [rows]=await pool.execute("SELECT storage_key FROM gallery_items WHERE id=? AND status='published' AND permission_confirmed=TRUE",[id]);if(!rows.length)return res.status(404).end();const bytes=await storage.read(rows[0].storage_key);const ext=rows[0].storage_key.split('.').pop();res.set('Content-Type',({jpg:'image/jpeg',png:'image/png',webp:'image/webp'})[ext]||'application/octet-stream');res.set('Cache-Control','public, max-age=3600').set('X-Content-Type-Options','nosniff').send(bytes);}catch(error){next(error);}});

router.get('/site-settings',async(_req,res,next)=>{try{const [rows]=await pool.execute("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('background_image_key','background_tint')");const settings=Object.fromEntries(rows.map(x=>[x.setting_key,x.setting_value]));res.set('Cache-Control','public,max-age=60');res.json({settings:{background_image_url:settings.background_image_key?'/api/public/site-background':'',background_tint:settings.background_tint||'#071a17'}});}catch(error){next(error);}});
router.get('/site-background',async(_req,res,next)=>{try{const [rows]=await pool.execute("SELECT setting_value FROM site_settings WHERE setting_key='background_image_key'");if(!rows[0]?.setting_value)return res.status(404).end();const key=rows[0].setting_value;const bytes=await storage.read(key);const ext=key.split('.').pop();res.set('Content-Type',({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[ext]||'application/octet-stream').set('Cache-Control','public,max-age=3600').set('X-Content-Type-Options','nosniff').send(bytes);}catch(error){next(error);}});
router.get('/announcements', async (req,res,next)=>{
  const category=text(req.query.category,20);
  if(category&&!['academic','timetable','event','general'].includes(category))return res.status(400).json({error:'Invalid announcement category.'});
  try{
    const [rows]=await pool.execute(
      "SELECT id,title,body,category,priority,published_at AS publishedAt FROM announcements WHERE status='published' AND audience='public' AND (?='' OR category=?) ORDER BY published_at DESC LIMIT 20",
      [category,category]
    );
    res.json({announcements:rows});
  }catch(error){next(error);}
});

router.get('/events',async(_req,res,next)=>{
  try{
    const [rows]=await pool.execute("SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,ends_at AS endsAt,venue FROM events WHERE status='published' AND starts_at>=UTC_TIMESTAMP() ORDER BY starts_at LIMIT 20");
    res.json({events:rows});
  }catch(error){next(error);}
});

router.get('/directory',async(req,res,next)=>{
  const search=text(req.query.search,100);
  try{
    const pattern='%'+search+'%';
    const [rows]=await pool.execute(
      "SELECT id,public_display_name AS displayName,profile_photo_key AS photoKey FROM users WHERE role='student' AND status='active' AND directory_public=TRUE AND public_display_name IS NOT NULL AND public_display_name LIKE ? ORDER BY public_display_name LIMIT 100",
      [pattern]
    );
    res.json({students:rows});
  }catch(error){next(error);}
});

router.post('/contact',contactLimiter,async(req,res,next)=>{
  const name=text(req.body.name,160),email=text(req.body.email,254).toLowerCase(),subject=text(req.body.subject,200),message=text(req.body.message,5000);
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||subject.length<2||message.length<5)return res.status(400).json({error:'Enter your name, a valid email, a subject and a message.'});
  try{
    await pool.execute('INSERT INTO contact_messages (sender_name,sender_email,subject,message) VALUES (?,?,?,?)',[name,email,subject,message]);
    res.status(201).json({message:'Your message has been received.'});
  }catch(error){next(error);}
});

router.post('/unsubscribe',async(req,res,next)=>{
  const token=text(req.body.token,80);
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return res.status(400).json({error:'This unsubscribe link is invalid or expired.'});
  const connection=await pool.getConnection();
  try{
    await connection.beginTransaction();
    const hash=createHash('sha256').update(token).digest('hex');
    const [rows]=await connection.execute('SELECT id,user_id FROM email_unsubscribe_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[hash]);
    if(!rows.length){await connection.rollback();return res.status(400).json({error:'This unsubscribe link is invalid or expired.'});}
    await connection.execute('UPDATE email_unsubscribe_tokens SET used_at=UTC_TIMESTAMP() WHERE id=?',[rows[0].id]);
    await connection.execute('UPDATE users SET email_unsubscribed_at=COALESCE(email_unsubscribed_at,UTC_TIMESTAMP()) WHERE id=?',[rows[0].user_id]);
    await connection.commit();
    res.json({message:'You have been unsubscribed from non-essential class emails.'});
  }catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

module.exports=router;
