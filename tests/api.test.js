// La API de reportes con el almacén en memoria (sin DATABASE_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const { default: handler } = await import('../api/reportes.js');

function llamar(method, body, { ip = '1.1.1.1', origin } = {}) {
  return new Promise(resolve => {
    const headers = { host: 'ojoaltren.com', 'x-forwarded-for': ip, ...(origin ? { origin } : {}) };
    const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; },
      end(s) { resolve({ status: this.statusCode, h: this.h, d: JSON.parse(s) }); } };
    handler({ method, headers, body }, res);
  });
}
const rep = (o = {}) => ({ tramo: 'l1-14', estado: 'detenido', ubicado: true, autor: 'yo-abc12345', ...o });

test('un reporte enviado lo ve cualquiera, sin el id real del navegador', async () => {
  const p = await llamar('POST', rep());
  assert.equal(p.status, 201);
  const g = await llamar('GET');
  assert.equal(g.status, 200);
  const r = g.d.reportes.find(x => x.id === p.d.reporte.id);
  assert.equal(r.tramo, 'l1-14'); assert.equal(r.estado, 'detenido'); assert.equal(r.ubicado, true);
  assert.notEqual(r.autor, 'yo-abc12345');
  assert.ok(!('red_hash' in r), 'no se publica el hash de la red');
  assert.match(g.h['cache-control'], /s-maxage/);
});

test('el mismo navegador no puede repetir el tramo al instante', async () => {
  assert.equal((await llamar('POST', rep())).status, 429);
  assert.equal((await llamar('POST', rep({ tramo: 'l1-15' }))).status, 201);
});

test('rechaza datos inválidos', async () => {
  assert.equal((await llamar('POST', rep({ tramo: 'l9-99' }))).status, 400);
  assert.equal((await llamar('POST', rep({ estado: 'volando' }))).status, 400);
  assert.equal((await llamar('POST', rep({ ubicado: 'si' }))).status, 400);
  assert.equal((await llamar('POST', rep({ autor: '<script>' }))).status, 400);
  assert.equal((await llamar('POST', '{no es json')).status, 400);
  assert.equal((await llamar('DELETE')).status, 405);
});

test('solo acepta reportes desde la propia web', async () => {
  assert.equal((await llamar('POST', rep({ autor: 'otro-1234567' }), { origin: 'https://malo.example' })).status, 403);
  assert.equal((await llamar('POST', rep({ autor: 'otro-1234567' }), { origin: 'https://ojoaltren.com' })).status, 201);
});

test('límite por navegador: 15 por hora', async () => {
  const tramos = Array.from({ length: 16 }, (_, i) => `l1-${String(i + 1).padStart(2, '0')}`);
  const st = [];
  for (const t of tramos) st.push((await llamar('POST', rep({ autor: 'limite-1234', tramo: t }), { ip: '2.2.2.2' })).status);
  assert.deepEqual(st.slice(0, 15), Array(15).fill(201));
  assert.equal(st[15], 429);
});
