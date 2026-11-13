const express = require('express');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth, requireRole('student', 'admin'));
const sendLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'You are sending messages too quickly. Try again in a minute.' } });
function id(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }
function bodyText(value) { return typeof value === 'string' ? value.trim().slice(0, 2000) : ''; }
async function hasGroupAccess(groupId, userId) {
  const [rows] = await pool.execute('SELECT 1 FROM chat_group_members WHERE group_id=? AND user_id=? LIMIT 1', [groupId, userId]);
  return rows.length > 0;
}
router.get('/rooms', async (req, res, next) => {
  try {
    const [peers] = await pool.execute("SELECT id,full_name AS fullName FROM users WHERE id<>? AND role='student' AND status='active' AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL) ORDER BY full_name", [req.user.id]);
    const [groups] = await pool.execute('SELECT g.id,g.name FROM chat_groups g JOIN chat_group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.name', [req.user.id]);
    res.set('Cache-Control', 'no-store').json({ peers, groups });
  } catch (error) { next(error); }
});
router.get('/eligible-students', requireRole('admin'), async (_req, res, next) => {
  try {
    const [students] = await pool.execute("SELECT id,full_name AS fullName FROM users WHERE role='student' AND status='active' AND (email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL) ORDER BY full_name");
    res.set('Cache-Control', 'no-store').json({ students });
  } catch (error) { next(error); }
});
router.post('/groups', requireRole('admin'), async (req, res, next) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const rawIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const memberIds = [...new Set(rawIds.map(id).filter(Boolean))].slice(0, 250);
  if (!name || !/^[\p{L}\p{N} ._-]{1,80}$/u.test(name)) return res.status(400).json({ error: 'Enter a group name using letters, numbers, spaces, dots, underscores or hyphens.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO chat_groups(name,created_by) VALUES(?,?)', [name, req.user.id]);
    const groupId = result.insertId;
    const ids = [...new Set([req.user.id, ...memberIds])];
    const [valid] = await connection.execute('SELECT id FROM users WHERE id IN (' + ids.map(() => '?').join(',') + ") AND role IN ('student','admin') AND status='active' AND (role='admin' OR email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL)", ids);
    for (const person of valid) await connection.execute('INSERT IGNORE INTO chat_group_members(group_id,user_id,added_by) VALUES(?,?,?)', [groupId, person.id, req.user.id]);
    await connection.execute('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,context_json) VALUES(?,?,?,?,?)', [req.user.id, 'chat.group.create', 'chat_group', String(groupId), JSON.stringify({ memberCount: valid.length })]);
    await connection.commit();
    res.status(201).json({ message: 'Group created.', group: { id: groupId, name } });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A chat group with that name already exists.' });
    next(error);
  } finally { connection.release(); }
});
router.get('/messages', async (req, res, next) => {
  const type = req.query.type;
  let rows;
  const projection = 'SELECT m.id,m.body,m.created_at AS createdAt,m.sender_id AS senderId,u.full_name AS senderName,m.reply_to_message_id AS replyToId,p.body AS replyToBody,pu.full_name AS replyToSenderName FROM chat_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN chat_messages p ON p.id=m.reply_to_message_id LEFT JOIN users pu ON pu.id=p.sender_id ';
  try {
    if (type === 'general') {
      [rows] = await pool.execute(projection + "WHERE m.chat_type='general' ORDER BY m.id DESC LIMIT 100");
    } else if (type === 'individual') {
      const peerId = id(req.query.peerId);
      if (!peerId || peerId === Number(req.user.id)) return res.status(400).json({ error: 'Choose a valid classmate.' });
      const [peer] = await pool.execute("SELECT id FROM users WHERE id=? AND role IN ('student','admin') AND status='active' AND (role='admin' OR email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL)", [peerId]);
      if (!peer.length) return res.status(404).json({ error: 'That chat participant is unavailable.' });
      [rows] = await pool.execute(projection + "WHERE m.chat_type='individual' AND ((m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?)) ORDER BY m.id DESC LIMIT 100", [req.user.id, peerId, peerId, req.user.id]);
    } else if (type === 'group') {
      const groupId = id(req.query.groupId);
      if (!groupId) return res.status(400).json({ error: 'Choose a group.' });
      if (!(await hasGroupAccess(groupId, req.user.id))) return res.status(403).json({ error: 'You are not a member of that group.' });
      [rows] = await pool.execute(projection + "WHERE m.chat_type='group' AND m.group_id=? ORDER BY m.id DESC LIMIT 100", [groupId]);
    } else return res.status(400).json({ error: 'Choose general, individual or group chat.' });
    res.set('Cache-Control', 'no-store').json({ messages: rows.reverse().map((message) => ({ ...message, isMine: Number(message.senderId) === Number(req.user.id) })) });
  } catch (error) { next(error); }
});

router.post('/messages', sendLimiter, async (req, res, next) => {
  const type = req.body.type;
  const body = bodyText(req.body.body);
  let replyToId = null;
  if (req.body.replyToId != null) { replyToId = id(req.body.replyToId); if (!replyToId) return res.status(400).json({ error: 'Choose a valid message to reply to.' }); }
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  try {
    let recipientId = null, groupId = null;
    if (type === 'individual') {
      recipientId = id(req.body.peerId);
      if (!recipientId || recipientId === Number(req.user.id)) return res.status(400).json({ error: 'Choose a valid classmate.' });
      const [peer] = await pool.execute("SELECT id FROM users WHERE id=? AND role IN ('student','admin') AND status='active' AND (role='admin' OR email_verified_at IS NOT NULL OR admin_approved_at IS NOT NULL)", [recipientId]);
      if (!peer.length) return res.status(404).json({ error: 'That chat participant is unavailable.' });
    } else if (type === 'group') {
      groupId = id(req.body.groupId);
      if (!groupId) return res.status(400).json({ error: 'Choose a group.' });
      if (!(await hasGroupAccess(groupId, req.user.id))) return res.status(403).json({ error: 'You are not a member of that group.' });
    } else if (type !== 'general') return res.status(400).json({ error: 'Choose general, individual or group chat.' });
    if (replyToId) {
      let parentRows;
      if (type === 'general') [parentRows] = await pool.execute("SELECT id FROM chat_messages WHERE id=? AND chat_type='general'", [replyToId]);
      else if (type === 'group') [parentRows] = await pool.execute("SELECT id FROM chat_messages WHERE id=? AND chat_type='group' AND group_id=?", [replyToId, groupId]);
      else [parentRows] = await pool.execute("SELECT id FROM chat_messages WHERE id=? AND chat_type='individual' AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))", [replyToId, req.user.id, recipientId, recipientId, req.user.id]);
      if (!parentRows.length) return res.status(400).json({ error: 'Choose a message from this conversation to reply to.' });
    }
    const [result] = await pool.execute('INSERT INTO chat_messages(chat_type,sender_id,recipient_id,group_id,body,reply_to_message_id) VALUES(?,?,?,?,?,?)', [type, req.user.id, recipientId, groupId, body, replyToId]);
    res.status(201).json({ message: 'Message posted.', id: result.insertId });
  } catch (error) { next(error); }
});
module.exports = router;
