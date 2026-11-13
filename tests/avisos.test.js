// /api/avisos: comunicados de lineauno.pe, sin salir a internet (fetch simulado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { normalizar, imagenDe, texto, _olvidar } from '../api/avisos.js';

const IMG = '<figure><img width="1024" data-src="https://www.lineauno.pe/wp-content/uploads/2026/11/aviso-1024x1024.jpeg" '
  + 'data-srcset="https://www.lineauno.pe/wp-content/uploads/2026/11/aviso-1024x1024.jpeg 1024w, https://www.lineauno.pe/wp-content/uploads/2026/11/aviso-200x200.jpeg 200w, '
  + 'https://www.lineauno.pe/wp-content/uploads/2026/11/aviso-768x768.jpeg 768w" src="data:image/svg+xml;base64,PHN2Zz4=" /></figure>';
const WP = [
  { id: 15450, date_gmt: '2026-11-10T17:15:04', link: 'https://www.lineauno.pe/noticias/comunicado-cierre-temporal-estacion-la-cultura/',
    title: { rendered: 'Comunicado | Cierre temporal estaci&oacute;n La Cultura &#8211; Lima' }, content: { rendered: IMG } },
  { id: 15460, date_gmt: '2026-11-12T23:55:28', link: 'https://www.lineauno.pe/noticias/viajes/',
    title: { rendered: 'COMUNICADO | Viajes gratuitos' }, content: { rendered: '<p>sin imagen</p>' } },
  { id: 1, date_gmt: '2026-11-01T00:00:00', link: 'https://otro-sitio.com/x', title: { rendered: 'Enlace ajeno' }, content: { rendered: '' } },
];

function llamar(traer, method = 'GET') {
  return new Promise(resolve => {
    const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; },
      end(s) { resolve({ status: this.statusCode, h: this.h, d: JSON.parse(s) }); } };
    handler({ method, headers: {} }, res, { traer });
  });
}
const ok = datos => async () => ({ ok: true, status: 200, json: async () => datos });

test('separa el tipo del título y decodifica las entidades', () => {
  const [a, b] = normalizar(WP);
  assert.equal(a.tipo, 'Comunicado'); assert.equal(b.tipo, 'Comunicado');
  assert.equal(a.titulo, 'Cierre temporal estación La Cultura – Lima');
  assert.equal(b.titulo, 'Viajes gratuitos');
  assert.equal(a.fecha, '2026-11-10T17:15:04.000Z');
  assert.equal(texto('&#8220;Hola&#8221; &amp; adi&#243;s'), '“Hola” & adiós');
  assert.equal(texto('<<b>script>alert(1)<</b>/script> &lt;img&gt;'), 'scriptalert(1)/script img', 'nunca devuelve < ni >');
});

test('elige la imagen de ~768 px del comunicado, nunca el placeholder', () => {
  assert.equal(imagenDe(IMG), 'https://www.lineauno.pe/wp-content/uploads/2026/11/aviso-768x768.jpeg');
  assert.equal(imagenDe('<img src="https://www.lineauno.pe/a.jpg">'), 'https://www.lineauno.pe/a.jpg');
  assert.equal(imagenDe('<img src="https://malo.com/a.jpg">'), null);
  assert.equal(imagenDe('<p>nada</p>'), null);
});

test('descarta lo que no es de lineauno.pe', () => {
  assert.deepEqual(normalizar(WP).map(a => a.id), [15450, 15460]);
  assert.deepEqual(normalizar(null), []);
});

test('GET devuelve los avisos con caché de CDN; si lineauno.pe cae, sirve lo último', async () => {
  _olvidar();
  const r = await llamar(ok(WP));
  assert.equal(r.status, 200); assert.equal(r.d.avisos.length, 2);
  assert.match(r.h['cache-control'], /s-maxage=600/);
  const caido = async () => { throw new Error('sin red'); };
  assert.equal((await llamar(caido)).d.avisos.length, 2, 'usa lo guardado aunque falle');
  _olvidar();
  const r2 = await llamar(caido);
  assert.equal(r2.status, 502); assert.deepEqual(r2.d.avisos, []);
  assert.equal((await llamar(ok(WP), 'POST')).status, 405);
});
