// Crea la tabla de reportes en DATABASE_URL (opcional: la API también la crea sola).  Uso: npm run db:init
import fs from 'node:fs';
import pg from 'pg';

for (const l of (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('✖ Falta DATABASE_URL en .env'); process.exit(1); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(fs.readFileSync('db/schema.sql', 'utf8'));
const { rows } = await client.query('SELECT count(*)::int AS n FROM reportes');
console.log(`✔ Tabla «reportes» lista (${rows[0].n} filas)`);
await client.end();
