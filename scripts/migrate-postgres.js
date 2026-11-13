require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const sslCa = process.env.DATABASE_SSL_CA;
const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST,
  port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
  database: process.env.PGDATABASE || process.env.DB_NAME,
  user: process.env.PGUSER || process.env.DB_USER,
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  ssl: sslCa ? { ca: sslCa, rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 10000,
});
(async () => {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const found = await client.query('SELECT version FROM schema_migrations WHERE version=$1', ['001_class_sphere_postgresql']);
    if (found.rowCount) { console.log('PostgreSQL schema already applied.'); return; }
    const sql = await fs.readFile(path.join(__dirname, '..', 'database', 'postgresql.sql'), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', ['001_class_sphere_postgresql']);
      await client.query('COMMIT');
      console.log('PostgreSQL schema and course timetable applied.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } finally { client.release(); await pool.end(); }
})().catch(error => { console.error('PostgreSQL migration failed:', error.message); process.exitCode = 1; });
