/**
 * /api/avisos — los comunicados oficiales de Línea 1, tal como los publica lineauno.pe.
 *   GET → { ahora, fuente, avisos:[{id, fecha, tipo, titulo, url, imagen}] }  (los más nuevos primero)
 *
 * La web de Línea 1 es un WordPress con su API pública (/wp-json/wp/v2/noticias). Cada comunicado es
 * un título y una imagen cuadrada con el texto completo (la misma que suben a Facebook).
 * No copiamos nada: devolvemos el título, la fecha, el enlace y la dirección de su imagen.
 *
 * Para no cargar su web: la CDN de Vercel comparte la respuesta 10 minutos (como mucho ~6 consultas por hora) y, si lineauno.pe no
 * responde, se sirve lo último que se obtuvo.
 */
const ORIGEN = 'https://www.lineauno.pe';
const API = `${ORIGEN}/wp-json/wp/v2/noticias?per_page=10&_fields=id,date_gmt,link,title,content`;
const FRESCO_MS = 10 * 60_000;

let guardado = null;   // { t, avisos } — lo último bueno, por instancia

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿' };
export const texto = s => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').trim();

// solo imágenes y enlaces de lineauno.pe, por https
const deLinea1 = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)lineauno\.pe$/.test(x.hostname) ? x.href : null; } catch (_) { return null; } };

/** La imagen del comunicado: la primera del contenido, en su versión de ~768 px si la hay (pesa ~60 KB). */
export function imagenDe(html) {
  const img = String(html || '').match(/<img\b[^>]*>/i)?.[0];
  if (!img) return null;
  const attr = n => img.match(new RegExp(`\\s${n}="([^"]*)"`, 'i'))?.[1];
  const set = (attr('data-srcset') || attr('srcset') || '').split(',').map(p => p.trim().split(/\s+/))
    .map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 })).filter(x => x.u);
  const medio = set.filter(x => x.w >= 600).sort((a, b) => a.w - b.w)[0];
  const src = [medio?.u, attr('data-src'), attr('src')].find(u => u && !u.startsWith('data:'));
  return src ? deLinea1(texto(src)) : null;
}

/** De la respuesta de WordPress a nuestros avisos. «Comunicado | Cierre temporal…» → tipo + título. */
export function normalizar(items) {
  return (Array.isArray(items) ? items : []).map(n => {
    const completo = texto(n?.title?.rendered);
    const m = completo.match(/^([^|]{2,30})\s*\|\s*(.+)$/);
    const tipo = m ? m[1].trim() : '';
    return {
      id: Number(n?.id),
      fecha: n?.date_gmt ? new Date(n.date_gmt + 'Z').toISOString() : null,
      tipo: tipo ? tipo[0].toUpperCase() + tipo.slice(1).toLowerCase() : 'Noticia',
      titulo: m ? m[2].trim() : completo,
      url: deLinea1(n?.link),
      imagen: imagenDe(n?.content?.rendered),
    };
  }).filter(a => Number.isFinite(a.id) && a.titulo && a.fecha && a.url);
}

function responder(res, status, datos, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(datos));
}

export default async function handler(req, res, { traer = fetch } = {}) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return responder(res, 405, { error: 'Método no permitido' }, 'no-store'); }
  const cache = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600';
  if (guardado && Date.now() - guardado.t < FRESCO_MS) return responder(res, 200, { ahora: Date.now(), fuente: ORIGEN, avisos: guardado.avisos }, cache);
  try {
    const r = await traer(API, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`lineauno.pe respondió ${r.status}`);
    const avisos = normalizar(await r.json());
    guardado = { t: Date.now(), avisos };
    return responder(res, 200, { ahora: Date.now(), fuente: ORIGEN, avisos }, cache);
  } catch (e) {
    console.warn('avisos:', e.message);
    if (guardado) return responder(res, 200, { ahora: Date.now(), fuente: ORIGEN, avisos: guardado.avisos, viejo: true }, 'public, max-age=60, s-maxage=60');
    return responder(res, 502, { error: 'No pudimos traer los comunicados de Línea 1.', avisos: [] }, 'no-store');
  }
}

/** Solo para las pruebas. */
export const _olvidar = () => { guardado = null; };
