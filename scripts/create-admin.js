require('dotenv').config();
const readline = require('node:readline');
const argon2 = require('argon2');
const pool = require('../src/db');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return reject(new Error('Run this command in an interactive Command Prompt or PowerShell terminal.'));
    let value = '';
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    const onData = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') { cleanup(); reject(new Error('Cancelled.')); }
      else if (key === '\r' || key === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); }
      else if (key === '\u0008' || key === '\u007f') { value = value.slice(0,-1); }
      else if (key >= ' ') value += key;
    };
    function cleanup() { input.removeListener('data', onData); input.setRawMode(false); input.pause(); }
    input.on('data', onData);
  });
}

(async () => {
  try {
    const [admins] = await pool.execute('SELECT COUNT(*) AS total FROM users WHERE role = ?', ['admin']);
    if (Number(admins[0].total) > 0) throw new Error('An administrator already exists. Use the account recovery process instead.');
    const fullName = await ask('Administrator full name: ');
    const email = (await ask('Administrator email: ')).toLowerCase();
    const password = await askHidden('Choose a password (12+ characters): ');
    const confirmation = await askHidden('Confirm password: ');
    if (fullName.length < 2 || fullName.length > 160) throw new Error('Name must be 2 to 160 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 12 || password.length > 128 || password !== confirmation) throw new Error('Passwords must match and be 12 to 128 characters.');
    const hash = await argon2.hash(password);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [fullName, email, hash, 'admin', 'active']
    );
    await pool.execute('INSERT IGNORE INTO notification_preferences (user_id) VALUES (?)', [result.insertId]);
    await pool.execute(
      'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, context_json) VALUES (?, ?, ?, ?, JSON_OBJECT(?, ?))',
      [result.insertId, 'admin.bootstrap', 'user', String(result.insertId), 'method', 'one-time CLI']
    );
    process.stdout.write('Administrator created. Use /admin-login.html to sign in.\n');
  } catch (error) {
    process.stderr.write('Administrator setup failed: ' + error.message + '\n');
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
