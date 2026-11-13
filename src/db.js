const { Pool, types } = require('pg');
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || process.env.DB_HOST,
  port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
  database: process.env.PGDATABASE || process.env.DB_NAME,
  user: process.env.PGUSER || process.env.DB_USER,
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA, rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
types.setTypeParser(20, value => Number(value));
const idTables = new Set(['users','semesters','units','timetable_entries','email_verification_tokens','password_reset_tokens','announcements','notifications','resources','events','gallery_items','ai_announcement_drafts','email_campaigns','email_recipients','audit_logs','contact_messages','class_popup_states','email_unsubscribe_tokens','chat_groups','chat_messages']);
const conflictKeys = { app_sessions: 'session_id', site_settings: 'setting_key', notification_preferences: 'user_id', class_popup_states: 'user_id,timetable_entry_id,class_date' };
function translate(sql) {
  let text = sql.replace(/\bUTC_TIMESTAMP\(\)/gi, 'CURRENT_TIMESTAMP').replace(/\bUTC_DATE\(\)/gi, 'CURRENT_DATE');
  text = text.replace(/DATE_ADD\(CURRENT_TIMESTAMP,\s*INTERVAL\s*(\d+)\s+(MINUTE|HOUR|DAY|YEAR)\)/gi, (_, n, unit) => "(CURRENT_TIMESTAMP + INTERVAL '" + n + ' ' + unit.toLowerCase() + "')");
  text = text.replace(/DATE_SUB\(CURRENT_DATE,\s*INTERVAL\s*(\d+)\s+(MINUTE|HOUR|DAY|YEAR)\)/gi, (_, n, unit) => "(CURRENT_DATE - INTERVAL '" + n + ' ' + unit.toLowerCase() + "')");
  text = text.replace(/TIME_FORMAT\(([^,]+),\s*'%H:%i'\)/gi, "to_char($1, 'HH24:MI')");
  text = text.replace(/FIELD\(([^,]+),\s*('(?:[^']|'')*'(?:\s*,\s*'(?:[^']|'')*')*)\)/gi, 'array_position(ARRAY[$2], $1)');
  text = text.replace(/JSON_UNQUOTE\(JSON_EXTRACT\(([^,]+),\s*'\$\.([a-zA-Z0-9_]+)'\)\)/gi, "($1->>'$2')");
  text = text.replace(/JSON_OBJECT\(/gi, 'jsonb_build_object(');
  text = text.replace("admin_approved_at=IF(email_verified_at IS NULL AND ?='active',COALESCE(admin_approved_at,CURRENT_TIMESTAMP),admin_approved_at)", "admin_approved_at=CASE WHEN email_verified_at IS NULL AND ?='active' THEN COALESCE(admin_approved_at,CURRENT_TIMESTAMP) ELSE admin_approved_at END");
  const upsert = /\s+ON DUPLICATE KEY UPDATE ([\s\S]*)$/i.exec(text);
  if (upsert) {
    const table = /INSERT\s+INTO\s+([a-z_]+)/i.exec(text)?.[1]?.toLowerCase();
    const keys = conflictKeys[table];
    if (!keys) throw new Error('PostgreSQL conflict key missing for ' + table);
    const assigns = upsert[1].replace(/VALUES\(([a-z_]+)\)/gi, 'EXCLUDED.$1');
    text = text.slice(0, upsert.index) + ' ON CONFLICT (' + keys + ') DO UPDATE SET ' + assigns;
  }
  const ignoredInsert = /^\s*INSERT\s+IGNORE\s+/i.test(text);
  text = text.replace(/^\s*INSERT\s+IGNORE\s+/i, 'INSERT ');
  if (ignoredInsert) text += ' ON CONFLICT DO NOTHING';
  let n = 0;
  text = text.replace(/\?/g, () => '$' + (++n));
  text = text.replace(/\bAS\s+([a-z_][a-z0-9_]*)/gi, (all, alias) => /[A-Z]/.test(alias) ? 'AS "' + alias + '"' : all);
  return text;
}
function wrapClient(client) {
  return {
    async execute(sql, params = []) {
      let statement = translate(sql);
      const table = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(statement)?.[1]?.toLowerCase();
      if (table && idTables.has(table) && !/\bRETURNING\b/i.test(statement)) statement += ' RETURNING id';
      const result = await client.query(statement, params);
      if (/^\s*SELECT\b/i.test(statement)) return [result.rows];
      return [{ insertId: result.rows[0]?.id ?? 0, affectedRows: result.rowCount ?? 0, changedRows: result.rowCount ?? 0 }];
    },
    query(sql, params) { return client.query(translate(sql), params); },
    async beginTransaction() { await client.query('BEGIN'); },
    async commit() { await client.query('COMMIT'); },
    async rollback() { await client.query('ROLLBACK'); },
    release() { client.release?.(); },
  };
}
const pool = {
  execute(sql, params) { return wrapClient(pgPool).execute(sql, params); },
  query(sql, params) { return pgPool.query(translate(sql), params); },
  async getConnection() { return wrapClient(await pgPool.connect()); },
  end() { return pgPool.end(); },
};
pool.translate = translate;
module.exports = pool;
