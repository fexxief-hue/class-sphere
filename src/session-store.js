const session = require('express-session');
const pool = require('./db');

class MySQLSessionStore extends session.Store {
  get(sessionId, callback) {
    pool.execute(
      'SELECT session_data FROM app_sessions WHERE session_id = ? AND expires_at > UTC_TIMESTAMP()',
      [sessionId]
    ).then(([rows]) => {
      if (!rows.length) return callback(null, null);
      try { callback(null, JSON.parse(rows[0].session_data)); }
      catch (error) { callback(error); }
    }).catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    const expiryValue = sessionData.cookie && sessionData.cookie.expires;
    const expiresAt = expiryValue ? new Date(expiryValue) : new Date(Date.now() + 12 * 60 * 60 * 1000);
    pool.execute(
      'INSERT INTO app_sessions (session_id, session_data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_data = VALUES(session_data), expires_at = VALUES(expires_at)',
      [sessionId, JSON.stringify(sessionData), expiresAt]
    ).then(() => callback(null)).catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const expiryValue = sessionData.cookie && sessionData.cookie.expires;
    const expiresAt = expiryValue ? new Date(expiryValue) : new Date(Date.now() + 12 * 60 * 60 * 1000);
    pool.execute(
      'UPDATE app_sessions SET expires_at = ? WHERE session_id = ?',
      [expiresAt, sessionId]
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    pool.execute('DELETE FROM app_sessions WHERE session_id = ?', [sessionId])
      .then(() => callback(null)).catch(callback);
  }
}

setInterval(() => {
  pool.execute('DELETE FROM app_sessions WHERE expires_at <= UTC_TIMESTAMP()').catch(() => {});
}, 15 * 60 * 1000).unref();

module.exports = MySQLSessionStore;
