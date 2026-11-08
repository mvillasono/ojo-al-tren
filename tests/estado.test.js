// Pruebas de la lógica de consenso y caducidad.  Uso: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estadoTramo, estadoLinea, resumen, tramoCercano, tramoCercanoRed, ubicarEnRed } from '../lib/estado.js';

const AHORA = Date.parse('2026-11-08T18:00:00-05:00');
const hace = min => AHORA - min * 60_000;
const r = (estado, min, autor, extra = {}) => ({ tramo: 'l1-14', estado, t: hace(min), autor, ...extra });
const red = JSON.parse(fs.readFileSync(new URL('../data/lineas.json', import.meta.url), 'utf8'));
const [linea, linea2] = red.lineas;

test('sin reportes: sin datos', () => {
  assert.equal(estadoTramo([], AHORA).nivel, 'sin_reportes');
});

test('un solo reporte queda "sin confirmar"', () => {
  const e = estadoTramo([r('detenido', 2, 'a')], AHORA);
  assert.deepEqual([e.estado, e.nivel], ['detenido', 'sin_confirmar']);
});

test('dos personas distintas confirman', () => {
  const e = estadoTramo([r('detenido', 3, 'a'), r('detenido', 1, 'b')], AHORA);
  assert.deepEqual([e.estado, e.nivel, e.personas], ['detenido', 'confirmado', 2]);
});

test('la misma persona reportando varias veces cuenta una sola vez', () => {
  const e = estadoTramo([r('detenido', 5, 'a'), r('detenido', 3, 'a'), r('detenido', 1, 'a')], AHORA);
  assert.equal(e.nivel, 'sin_confirmar');
  assert.equal(e.personas, 1);
});

test('los reportes caducan a los 20 min', () => {
  const e = estadoTramo([r('detenido', 25, 'a'), r('detenido', 21, 'b')], AHORA);
  assert.equal(e.nivel, 'sin_reportes');
});

test('lo reciente pesa más que lo viejo: el tren volvió a andar', () => {
  const e = estadoTramo([r('detenido', 18, 'a'), r('detenido', 16, 'b'), r('normal', 2, 'c'), r('normal', 1, 'd')], AHORA);
  assert.deepEqual([e.estado, e.nivel], ['normal', 'confirmado']);
});

test('reportes contradictorios y parejos: sin confirmar, y gana el más grave', () => {
  const e = estadoTramo([r('normal', 2, 'a'), r('detenido', 2, 'b')], AHORA);
  assert.deepEqual([e.estado, e.nivel], ['detenido', 'sin_confirmar']);
});

test('con ubicación sobre la vía pesa más', () => {
  const e = estadoTramo([r('normal', 2, 'a'), r('lento', 2, 'b', { ubicado: true })], AHORA);
  assert.equal(e.estado, 'lento');
});

test('el aviso oficial manda sobre los usuarios por 60 min', () => {
  const rs = [r('normal', 2, 'a'), r('normal', 1, 'b'), r('sin_servicio', 30, 'linea1', { fuente: 'oficial' })];
  assert.deepEqual([estadoTramo(rs, AHORA).estado, estadoTramo(rs, AHORA).nivel], ['sin_servicio', 'oficial']);
  assert.equal(estadoTramo([r('sin_servicio', 70, 'linea1', { fuente: 'oficial' })], AHORA).nivel, 'sin_reportes');
});

test('los reportes del futuro (reloj adelantado) no cuentan', () => {
  assert.equal(estadoTramo([r('detenido', -5, 'a'), r('detenido', -5, 'b')], AHORA).nivel, 'sin_reportes');
});

test('el resumen une tramos contiguos con el mismo problema', () => {
  const rs = ['l1-14', 'l1-15'].flatMap(tramo => [
    { tramo, estado: 'detenido', t: hace(2), autor: 'a' + tramo }, { tramo, estado: 'detenido', t: hace(1), autor: 'b' + tramo }]);
  const res = resumen(linea, estadoLinea(linea, rs, AHORA));
  assert.equal(res.tipo, 'problemas');
  assert.equal(res.grupos.length, 1);
  assert.deepEqual([res.grupos[0].desde, res.grupos[0].hasta, res.grupos[0].tramos.length], ['l1-arriola', 'l1-miguel-grau', 2]);
});

test('la línea tiene 26 estaciones y 25 tramos encadenados', () => {
  assert.equal(linea.estaciones.length, 26);
  assert.equal(linea.tramos.length, 25);
  linea.tramos.forEach((t, i) => assert.equal(t.desde, linea.estaciones[i].id));
});

test('ubicación: un punto en la vía cae en su tramo, uno lejos queda lejos', () => {
  const t = linea.tramos.find(x => x.desde === 'l1-gamarra');
  const medio = t.coords[Math.floor(t.coords.length / 2)];
  const c = tramoCercano(linea, medio);
  assert.equal(c.tramo.id, t.id);
  assert.ok(c.metros < 5);
  assert.ok(tramoCercano(linea, [-77.03, -12.12]).metros > 1000);   // Miraflores: lejos de la vía
});

test('Línea 2: 5 estaciones y 4 tramos encadenados, de Mercado Santa Anita a Evitamiento', () => {
  assert.equal(linea2.id, 'L2');
  assert.deepEqual(linea2.estaciones.map(e => e.nombre),
    ['Mercado Santa Anita', 'Hermilio Valdizán', 'Colectora Industrial', 'Óvalo Santa Anita', 'Evitamiento']);
  assert.equal(linea2.tramos.length, 4);
  linea2.tramos.forEach((t, i) => { assert.equal(t.desde, linea2.estaciones[i].id); assert.ok(t.coords.length >= 2); assert.ok(t.km > 0); });
});

test('los tramos empiezan y terminan en su estación (proyección sobre la vía)', () => {
  for (const l of red.lineas) for (const t of l.tramos) {
    const a = l.estaciones.find(e => e.id === t.desde);
    assert.ok(tramoCercano({ tramos: [t] }, [a.lon, a.lat]).metros < 150, `${t.id} lejos de ${a.nombre}`);
  }
});

test('ubicación en la red: un punto de la Línea 2 cae en la Línea 2', () => {
  const t = linea2.tramos[1], medio = t.coords[Math.floor(t.coords.length / 2)];
  const c = tramoCercanoRed(red.lineas, medio);
  assert.equal(c.linea.id, 'L2');
  assert.equal(c.tramo.id, t.id);
});

test('los ids de tramos y estaciones no se repiten entre líneas', () => {
  const t = red.lineas.flatMap(l => l.tramos.map(x => x.id)), e = red.lineas.flatMap(l => l.estaciones.map(x => x.id));
  assert.equal(new Set(t).size, t.length);
  assert.equal(new Set(e).size, e.length);
});

/* ---------- ubicar a quien reporta ---------- */
const est = id => red.lineas.flatMap(l => l.estaciones).find(e => e.id === id);
const mover = ([lon, lat], norteM, esteM) => [lon + esteM / (111320 * Math.cos(lat * Math.PI / 180)), lat + norteM / 110574];

test('en una estación intermedia: ofrece sus dos tramos vecinos', () => {
  const g = est('l1-gamarra'), u = ubicarEnRed(red.lineas, [g.lon, g.lat]);
  assert.equal(u.tipo, 'estacion');
  assert.equal(u.estacion.id, 'l1-gamarra');
  assert.deepEqual(u.opciones.map(t => t.id).sort(), ['l1-14', 'l1-15']);
  assert.equal(u.tramo.id, u.opciones[0].id);
});

test('en una estación terminal: un solo tramo', () => {
  const v = est('l1-villa-el-salvador'), u = ubicarEnRed(red.lineas, [v.lon, v.lat]);
  assert.deepEqual([u.tipo, u.opciones.map(t => t.id)], ['estacion', ['l1-01']]);
});

test('entre estaciones, sobre la vía: ese tramo y su estación más cercana', () => {
  const t = linea.tramos.find(x => x.desde === 'l1-angamos');
  // punto medio por distancia (los vértices no están repartidos parejo)
  const largo = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]);
  const total = t.coords.slice(1).reduce((s, c, i) => s + largo(t.coords[i], c), 0);
  let resto = total / 2, medio = t.coords[0];
  for (let i = 1; i < t.coords.length; i++) {
    const l = largo(t.coords[i - 1], t.coords[i]);
    if (resto <= l) { const f = resto / l; medio = [t.coords[i - 1][0] + f * (t.coords[i][0] - t.coords[i - 1][0]), t.coords[i - 1][1] + f * (t.coords[i][1] - t.coords[i - 1][1])]; break; }
    resto -= l;
  }
  const u = ubicarEnRed(red.lineas, medio);
  assert.equal(u.tipo, 'via');
  assert.equal(u.tramo.id, t.id);
  assert.ok(['l1-angamos', 'l1-san-borja-sur'].includes(u.estacion.id));
});

test('en la Línea 2: la detecta', () => {
  const e = est('l2-colectora-industrial'), u = ubicarEnRed(red.lineas, [e.lon, e.lat]);
  assert.deepEqual([u.tipo, u.linea.id, u.opciones.length], ['estacion', 'L2', 2]);
});

test('a ~700 m de una estación y fuera de la vía: sugerencia, no ubicado', () => {
  const g = est('l1-gamarra'), u = ubicarEnRed(red.lineas, mover([g.lon, g.lat], 0, -700));
  assert.equal(u.tipo, 'cerca');
  assert.equal(u.estacion.id, 'l1-gamarra');
  assert.ok(u.tramo);
});

test('lejos de todo (Miraflores): elegir a mano', () => {
  assert.equal(ubicarEnRed(red.lineas, [-77.03, -12.12]).tipo, 'lejos');
});
