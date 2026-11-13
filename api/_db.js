/**
 * Almacén de reportes. Con DATABASE_URL usa PostgreSQL (Neon); sin ella, memoria
 * (solo para probar en local: se pierde al reiniciar). Los archivos que empiezan con «_»
 * no son funciones de Vercel.
 */
import fs from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, ssl: { rejectUnauthorized: false } }) : null;
export const enMemoria = () => !pool;

// la tabla se crea sola la primera vez (CREATE … IF NOT EXISTS): no hace falta un paso aparte
let lista = null;
const preparar = () => (lista ||= pool.query(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  .catch(e => { lista = null; throw e; }));

const memoria = [], memoriaEst = [];
const TABLAS = new Set(['reportes', 'reportes_estacion']);
let siguiente = 1;
const fila = r => ({ id: Number(r.id), tramo: r.tramo, estado: r.estado, motivo: r.motivo || null, ubicado: r.ubicado, autor: r.autor,
  t: new Date(r.creado).getTime() });

/** Reportes de los últimos `min` minutos, del más antiguo al más nuevo. */
export async function recientes(min) {
  if (!pool) { const d = Date.now() - min * 60_000; return memoria.filter(r => r.creado >= d).map(fila); }
  await preparar();
  const { rows } = await pool.query(
    `SELECT id, tramo, estado, motivo, ubicado, autor, creado FROM reportes WHERE creado > now() - make_interval(mins => $1) ORDER BY creado`, [min]);
  return rows.map(fila);
}

/** Cuántos reportes hubo en los últimos `min` minutos que cumplen el filtro {autor?, tramo?, estacion?, red_hash?}.
 *  `tabla`: 'reportes' (tramos) o 'reportes_estacion'. */
export async function contar(filtro, min, tabla = 'reportes') {
  if (!TABLAS.has(tabla)) throw new Error('tabla desconocida');
  const claves = Object.keys(filtro).filter(k => /^[a-z_]+$/.test(k));
  if (!pool) {
    const d = Date.now() - min * 60_000;
    return (tabla === 'reportes' ? memoria : memoriaEst).filter(r => r.creado >= d && claves.every(k => r[k] === filtro[k])).length;
  }
  await preparar();
  const cond = claves.map((k, i) => `${k} = $${i + 2}`).join(' AND ');
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM ${tabla} WHERE creado > now() - make_interval(mins => $1)${cond ? ' AND ' + cond : ''}`,
    [min, ...claves.map(k => filtro[k])]);
  return rows[0].n;
}

export async function guardar(r) {
  if (!pool) { const x = { id: siguiente++, ...r, creado: Date.now() }; memoria.push(x); return fila(x); }
  await preparar();
  const { rows } = await pool.query(
    `INSERT INTO reportes (tramo, estado, motivo, ubicado, autor, red_hash) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tramo, estado, motivo, ubicado, autor, creado`, [r.tramo, r.estado, r.motivo, r.ubicado, r.autor, r.red_hash]);
  return fila(rows[0]);
}

/* ---------- estaciones cerradas ---------- */
const filaEst = r => ({ id: Number(r.id), estacion: r.estacion, estado: r.estado, ubicado: r.ubicado, autor: r.autor, t: new Date(r.creado).getTime() });

/** Reportes de estación de los últimos `min` minutos, del más antiguo al más nuevo. */
export async function recientesEstacion(min) {
  if (!pool) { const d = Date.now() - min * 60_000; return memoriaEst.filter(r => r.creado >= d).map(filaEst); }
  await preparar();
  const { rows } = await pool.query(
    `SELECT id, estacion, estado, ubicado, autor, creado FROM reportes_estacion WHERE creado > now() - make_interval(mins => $1) ORDER BY creado`, [min]);
  return rows.map(filaEst);
}

export async function guardarEstacion(r) {
  if (!pool) { const x = { id: siguiente++, ...r, creado: Date.now() }; memoriaEst.push(x); return filaEst(x); }
  await preparar();
  const { rows } = await pool.query(
    `INSERT INTO reportes_estacion (estacion, estado, ubicado, autor, red_hash) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, estacion, estado, ubicado, autor, creado`, [r.estacion, r.estado, r.ubicado, r.autor, r.red_hash]);
  return filaEst(rows[0]);
}

/** Borra lo viejo: los reportes solo sirven unos minutos; se guardan `dias` para estadísticas. */
export async function limpiar(dias) {
  if (!pool) return;
  await pool.query(`DELETE FROM reportes WHERE creado < now() - make_interval(days => $1)`, [dias]);
  await pool.query(`DELETE FROM reportes_estacion WHERE creado < now() - make_interval(days => $1)`, [dias]);
}
