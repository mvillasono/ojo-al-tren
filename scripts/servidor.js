// Servidor local: la web de dist/ y la API (/api/reportes, /api/avisos), como en Vercel.  Uso: npm run dev
// Sin DATABASE_URL en .env los reportes viven en memoria (se pierden al cerrar).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
for (const l of (fs.existsSync(path.join(RAIZ, '.env')) ? fs.readFileSync(path.join(RAIZ, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { default: reportes } = await import('../api/reportes.js');
const { default: avisos } = await import('../api/avisos.js');
const DIST = path.join(RAIZ, 'dist'), PUERTO = Number(process.env.PORT || 3001);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

http.createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/api/reportes') return reportes(req, res);
  if (ruta === '/api/avisos') return avisos(req, res);
  if (ruta === '/qr' || /^\/e\/[a-z0-9-]+\/?$/.test(ruta)) ruta = '/';          // igual que vercel.json
  const candidatos = [ruta, ruta + '.html', path.posix.join(ruta, 'index.html')];   // cleanUrls
  for (const c of candidatos) {
    const f = path.join(DIST, path.normalize(c));
    if (f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
      return fs.createReadStream(f).pipe(res);
    }
  }
  res.statusCode = 404; res.end('No encontrado');
}).listen(PUERTO, () => console.log(`Ojo al Tren en http://localhost:${PUERTO}  (reportes: ${process.env.DATABASE_URL ? 'base de datos' : 'en memoria'})`));
