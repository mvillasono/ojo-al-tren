// Genera dist/ para publicar (Vercel) o probar en local.
//   node scripts/build.js           → usa PUBLIC_SITE_URL o el dominio de producción de Vercel
//   node scripts/build.js --local   → http://localhost:3001
//
// - una página por ruta (/, /linea-1, /linea-2) con su título, descripción, canonical y vista previa
// - config.js con lo que el navegador necesita (token PÚBLICO de Mapbox, modo demo)
// - robots.txt, sitemap.xml y manifest.webmanifest
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DIST = path.join(RAIZ, 'dist');
const LOCAL = process.argv.includes('--local');

// .env (solo variables públicas; ver .env.example)
const env = {};
const rutaEnv = path.join(RAIZ, '.env');
for (const l of (fs.existsSync(rutaEnv) ? fs.readFileSync(rutaEnv, 'utf8') : '').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !l.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const val = (k, d = '') => process.env[k] || env[k] || d;
const vercelProd = val('VERCEL_PROJECT_PRODUCTION_URL');
const sitio = (LOCAL ? 'http://localhost:3001' : val('PUBLIC_SITE_URL') || (vercelProd ? `https://${vercelProd}` : '')).replace(/\/+$/, '');
if (!sitio) console.warn('⚠ Sin PUBLIC_SITE_URL: canonical, vista previa y sitemap quedan con rutas relativas.');

const token = val('MAPBOX_TOKEN');
const config = {
  mapProvider: val('MAP_PROVIDER', token ? 'mapbox' : 'maplibre'),
  mapboxToken: token,
  mapboxStyle: val('MAPBOX_STYLE', 'mapbox://styles/mapbox/dark-v11'),
  demo: val('DEMO', 'si') !== 'no',
};

// Vercel Web Analytics (anónimo, sin cookies): solo publicado. Se activa en Vercel → proyecto → Analytics.
const ANALITICA = !LOCAL && val('ANALYTICS', 'si') !== 'no' ? '<script defer src="/_vercel/insights/script.js"></script>' : '';
const red = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/lineas.json'), 'utf8'));
// enlace «Colabora»: el repositorio de package.json (en un fork, apunta al fork)
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const repoUrl = String((paquete.repository || {}).url || paquete.homepage || '').replace(/^git\+/, '').replace(/\.git$/, '');
const L = Object.fromEntries(red.lineas.map(l => [l.id, l]));
const ruta = l => `${l.de} – ${l.a}`;

const PAGINAS = [
  { ruta: '/', archivo: 'index.html',
    titulo: 'Ojo al Tren: cómo está el Metro de Lima ahora',
    og: '¿Cómo está el tren ahora? Líneas 1 y 2 del Metro de Lima',
    descripcion: 'Estado de las Líneas 1 y 2 del Metro de Lima, tramo por tramo: si el tren va normal, lento o detenido, según los reportes de quienes viajan en ellas.',
    h1: 'Ojo al Tren: estado de las Líneas 1 y 2 del Metro de Lima' },
  ...red.lineas.map(l => ({
    ruta: `/linea-${l.id.slice(1)}`, archivo: `linea-${l.id.slice(1)}/index.html`,
    titulo: `${l.nombre} del Metro de Lima: ¿cómo está ahora? | Ojo al Tren`,
    og: `¿Cómo está la ${l.nombre} ahora? (${ruta(l)})`,
    descripcion: `Estado de la ${l.nombre} del Metro de Lima (${ruta(l)}), tramo por tramo: normal, lento o detenido, según los reportes de usuarios de los últimos 20 minutos.`,
    h1: `${l.nombre} del Metro de Lima (${ruta(l)}): estado ahora` })),
];
const intro = p => `${p.descripcion} Estaciones: ` + (p.ruta === '/' ? red.lineas : [L['L' + p.ruta.slice(-1)]])
  .map(l => `${l.nombre}: ${l.estaciones.map(e => e.nombre).join(', ')}`).join('. ') + '. Información de usuarios, no oficial.';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = p => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Ojo al Tren', url: `${sitio}${p.ruta}`,
  description: p.descripcion, applicationCategory: 'TravelApplication', operatingSystem: 'Web', inLanguage: 'es-PE',
  isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'PEN' },
  about: red.lineas.map(l => ({ '@type': 'Thing', name: `${l.nombre} del Metro de Lima`, description: ruta(l) })),
}).replace(/</g, '\\u003c');

// ---------- armar dist/ ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const plantilla = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
for (const p of PAGINAS) {
  const html = plantilla
    .replaceAll('__SITE_URL__', sitio).replaceAll('__RUTA__', p.ruta === '/' ? '/' : p.ruta)
    .replaceAll('__TITULO__', esc(p.titulo)).replaceAll('__OG_TITULO__', esc(p.og)).replaceAll('__DESCRIPCION__', esc(p.descripcion))
    .replaceAll('__H1__', esc(p.h1)).replaceAll('__REPO_URL__', esc(repoUrl))
    .replace('<!--__ANALITICA__-->', ANALITICA).replaceAll('__INTRO__', esc(intro(p))).replace('__JSON_LD__', jsonLd(p));
  const destino = path.join(DIST, p.archivo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}
for (const d of ['assets', 'lib']) fs.cpSync(path.join(RAIZ, d), path.join(DIST, d), { recursive: true });
fs.mkdirSync(path.join(DIST, 'data'));
fs.copyFileSync(path.join(RAIZ, 'data/lineas.json'), path.join(DIST, 'data/lineas.json'));
fs.copyFileSync(path.join(RAIZ, 'assets/favicon.ico'), path.join(DIST, 'favicon.ico'));
fs.writeFileSync(path.join(DIST, 'config.js'), `// Generado por scripts/build.js — no editar a mano\nwindow.OAT_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: 'Ojo al Tren', short_name: 'Ojo al Tren', lang: 'es-PE',
  description: 'Cómo está el Metro de Lima ahora, tramo por tramo, según quienes viajan en él.',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', background_color: '#0A0A0B', theme_color: '#0A0A0B',
  categories: ['travel', 'navigation', 'utilities'],
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
}, null, 2));
// rutas de los stickers (/qr, /e/<estación>) también en local: serve lee dist/serve.json
fs.writeFileSync(path.join(DIST, 'serve.json'), JSON.stringify({ rewrites: [
  { source: '/qr', destination: '/index.html' }, { source: '/e/:estacion', destination: '/index.html' }] }, null, 2));
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${sitio ? `Sitemap: ${sitio}/sitemap.xml\n` : ''}`);
if (sitio) {
  const hoy = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + PAGINAS.map(p => `  <url><loc>${sitio}${p.ruta}</loc><lastmod>${hoy}</lastmod><changefreq>always</changefreq><priority>${p.ruta === '/' ? '1.0' : '0.9'}</priority></url>`).join('\n')
    + '\n</urlset>\n');
}
console.log(`✔ dist/ (${PAGINAS.length} páginas, mapa: ${config.mapProvider === 'mapbox' && /^pk\./.test(token) ? 'Mapbox' : 'MapLibre'}, sitio: ${sitio || 'sin URL'})`);
