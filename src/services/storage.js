const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(process.env.PRIVATE_STORAGE_DIR || path.join(process.cwd(), 'private-storage'));
async function save(buffer, ext) { await fs.mkdir(root, { recursive: true, mode: 0o700 }); const key = randomUUID() + '.' + ext; await fs.writeFile(path.join(root,key), buffer, { flag: 'wx', mode: 0o600 }); return key; }
async function read(key) { if (typeof key !== 'string' || !/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key)) { const e=new Error('File not found'); e.code='ENOENT'; throw e; } return fs.readFile(path.join(root,key)); }
module.exports={save,read};
