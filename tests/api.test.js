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

test('el motivo es opcional, se guarda y se valida', async () => {
  const p = await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-20', motivo: 'puertas' }), { ip: '3.3.3.3' });
  assert.equal(p.status, 201);
  assert.equal(p.d.reporte.motivo, 'puertas');
  const g = await llamar('GET');
  assert.equal(g.d.reportes.find(x => x.id === p.d.reporte.id).motivo, 'puertas');
  const sin = await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-21' }), { ip: '3.3.3.3' });
  assert.equal(sin.d.reporte.motivo, null);
  assert.equal((await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-22', motivo: 'ovnis' }), { ip: '3.3.3.3' })).status, 400);
  assert.equal((await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-22', motivo: 'toString' }), { ip: '3.3.3.3' })).status, 400);
  assert.equal((await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-22', motivo: 7 }), { ip: '3.3.3.3' })).status, 400);
  assert.equal((await llamar('POST', rep({ autor: 'motivo-1234', tramo: 'l1-22', estado: 'normal', motivo: 'falla' }), { ip: '3.3.3.3' })).status, 400);
});

/* ---------- estaciones cerradas ---------- */
const est = (o = {}) => ({ estacion: 'l1-la-cultura', estado: 'cerrada', ubicado: true, autor: 'est-12345678', ...o });

test('estación cerrada: se guarda, la ve cualquiera en el GET y no se mezcla con los tramos', async () => {
  const p = await llamar('POST', est(), { ip: '4.4.4.4' });
  assert.equal(p.status, 201);
  assert.equal(p.d.reporte.estacion, 'l1-la-cultura');
  const g = await llamar('GET');
  const r = g.d.estaciones.find(x => x.id === p.d.reporte.id);
  assert.equal(r.estado, 'cerrada'); assert.notEqual(r.autor, 'est-12345678');
  assert.ok(!g.d.reportes.some(x => x.estacion), 'los tramos no traen reportes de estación');
});

test('estación: valida y frena la repetición', async () => {
  assert.equal((await llamar('POST', est(), { ip: '4.4.4.4' })).status, 429, 'la misma estación al instante');
  assert.equal((await llamar('POST', est({ estado: 'abierta', estacion: 'l1-gamarra' }), { ip: '4.4.4.4' })).status, 201);
  assert.equal((await llamar('POST', est({ estacion: 'l1-narnia' }))).status, 400);
  assert.equal((await llamar('POST', est({ estacion: 7 }))).status, 400);
  assert.equal((await llamar('POST', est({ estado: 'detenido', autor: 'otro-est-123' }))).status, 400);
  assert.equal((await llamar('POST', est({ estado: 'toString', autor: 'otro-est-123' }))).status, 400);
  assert.equal((await llamar('POST', est({ autor: '<x>' }))).status, 400);
});
