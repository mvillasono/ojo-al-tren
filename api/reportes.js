/**
 * /api/reportes — los reportes que todos ven.
 *   GET  → { ahora, reportes:[{id, tramo, estado, ubicado, autor, t}] } de los últimos 20 min
 *   POST { tramo, estado, ubicado, autor } → { reporte }
 *
 * Privacidad: no se recibe ni se guarda la ubicación (el navegador solo dice si el GPS lo puso
 * sobre la vía). El id del navegador y la IP se guardan como hash; el de la IP cambia cada día
 * y solo sirve para frenar abusos.
 *
 * Límites (anti-spam): 1 reporte por tramo cada minuto y 15 por hora por navegador;
 * 60 por hora desde una misma red (muchos celulares comparten IP con el operador).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { recientes, contar, guardar, limpiar, enMemoria } from './_db.js';

const VIGENCIA_MIN = 20;     // igual que REGLAS.vigenciaMin en lib/estado.js
const GUARDAR_DIAS = 7;
const LIMITES = [
  { min: 1,  max: 1,  por: ['autor', 'tramo'], msg: 'Ya reportaste este tramo hace un momento.' },
  { min: 60, max: 15, por: ['autor'],          msg: 'Llegaste al límite de reportes por hora. Gracias por ayudar.' },
  { min: 60, max: 60, por: ['red_hash'],       msg: 'Demasiados reportes desde esta red. Intenta en un rato.' },
];
const ESTADOS = new Set(['normal', 'lento', 'detenido', 'sin_servicio']);   // sin_servicio solo lo usan los avisos oficiales en la web, pero se acepta
const red = JSON.parse(fs.readFileSync(new URL('../data/lineas.json', import.meta.url), 'utf8'));
const TRAMOS = new Set(red.lineas.flatMap(l => l.tramos.map(t => t.id)));

// sal para los hash: AUTOR_SAL en Vercel. Sin ella, una al azar por instancia (los límites siguen, pero menos parejos).
const SAL = process.env.AUTOR_SAL || crypto.randomBytes(16).toString('hex');
const hash = (...p) => crypto.createHash('sha256').update(p.join('|')).digest('base64url').slice(0, 16);
const ipDe = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

async function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let s = '';
  for await (const c of req) { s += c; if (s.length > 2048) throw new Error('muy grande'); }
  return JSON.parse(s || '{}');
}
function responder(res, status, datos, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(datos));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const reportes = await recientes(VIGENCIA_MIN);
      // la CDN de Vercel lo comparte unos segundos: miles de visitas = pocas consultas a la base
      return responder(res, 200, { ahora: Date.now(), reportes }, 'public, max-age=0, s-maxage=10, stale-while-revalidate=20');
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { error: 'Método no permitido' }); }

    // solo desde la propia web (frena formularios de otros sitios; un script igual choca con los límites)
    const origen = req.headers.origin;
    if (origen && new URL(origen).host !== req.headers.host) return responder(res, 403, { error: 'Origen no permitido' });

    let b;
    try { b = await cuerpo(req); } catch { return responder(res, 400, { error: 'Cuerpo inválido' }); }
    const { tramo, estado, ubicado = false, autor } = b || {};
    if (!TRAMOS.has(tramo)) return responder(res, 400, { error: 'Tramo desconocido' });
    if (!ESTADOS.has(estado)) return responder(res, 400, { error: 'Estado desconocido' });
    if (typeof ubicado !== 'boolean') return responder(res, 400, { error: 'ubicado debe ser true o false' });
    if (typeof autor !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(autor)) return responder(res, 400, { error: 'Autor inválido' });

    const dia = new Date().toISOString().slice(0, 10);
    const r = { tramo, estado, ubicado, autor: hash(SAL, 'autor', autor), red_hash: hash(SAL, dia, ipDe(req)) };
    for (const l of LIMITES) {
      const filtro = Object.fromEntries(l.por.map(k => [k, r[k]]));
      if (await contar(filtro, l.min) >= l.max) { res.setHeader('Retry-After', String(l.min * 60)); return responder(res, 429, { error: l.msg }); }
    }
    const reporte = await guardar(r);
    if (Math.random() < 0.02) limpiar(GUARDAR_DIAS).catch(() => {});
    return responder(res, 201, { reporte });
  } catch (e) {
    console.error('api/reportes', e);
    return responder(res, 503, { error: enMemoria() ? 'Error interno' : 'La base de datos no responde. Intenta en un momento.' });
  }
}
