/**
 * Estado de cada tramo de la Línea 1 a partir de reportes de usuarios.
 * Módulo puro (sin DOM ni red): lo usan la web y las pruebas (npm test).
 *
 * Reporte: { tramo:'t14', estado:'normal'|'lento'|'detenido'|'sin_servicio', t:<ms>, autor:<id anónimo>,
 *            motivo?:'afluencia'|'puertas'|'estacion'|'falla' (opcional, nunca con 'normal'),
 *            ubicado?:true (el GPS lo puso sobre la vía), fuente?:'usuario'|'oficial' }
 *
 * Reglas:
 *  - Cada reporte pierde peso con el tiempo (vida media de 6 min) y caduca a los 20 min.
 *  - Un voto por persona y tramo: cuenta solo su último reporte.
 *  - Un reporte con ubicación sobre la vía pesa 1,5 veces más.
 *  - "Confirmado" pide al menos 2 personas distintas y que un estado reúna el 60 % del peso.
 *    Con menos, se muestra "sin confirmar".
 *  - Un aviso oficial manda sobre los usuarios durante 60 min (o hasta que otro aviso oficial lo cambie).
 *  - El motivo no decide el estado: entre quienes votaron el estado ganador, gana el motivo con más peso.
 */
// Paleta: el color solo aparece cuando hay algo que mirar. Normal es blanco (la vía "encendida"),
// los problemas tienen color y "sin reportes" es grafito apagado (SIN_DATOS).
export const ESTADOS = {
  normal:       { nombre: 'Normal',       color: '#EDEDED', orden: 0 },
  lento:        { nombre: 'Lento',        color: '#F5B83D', orden: 1 },
  detenido:     { nombre: 'Detenido',     color: '#FF4D4F', orden: 2 },
  sin_servicio: { nombre: 'Sin servicio', color: '#7C7C85', orden: 3 },
};
export const SIN_DATOS = '#2E2E33';
/** Por qué pasa (opcional): no es lo mismo detenido por una falla que lento por la cantidad de gente. */
export const MOTIVOS = {
  afluencia: { nombre: 'Mucha afluencia',        corto: 'Mucha afluencia', por: 'por mucha afluencia' },
  puertas:   { nombre: 'Puertas con problemas',  corto: 'Puertas',         por: 'por problemas en las puertas' },
  estacion:  { nombre: 'Incidencia en estación', corto: 'Incidencia',      por: 'por una incidencia en la estación' },
  falla:     { nombre: 'Falla técnica',          corto: 'Falla técnica',   por: 'por una falla técnica' },
};
export const REGLAS = { vigenciaMin: 20, vidaMediaMin: 6, pesoUbicado: 1.5, minPersonas: 2, mayoria: 0.6, oficialMin: 60,
  estacionMin: 60, estacionVidaMediaMin: 20 };
/** Estado de una estación (aparte del de los tramos): cerrada = el tren pasa pero no para; abierta = alguien vio que ya abrió. */
export const ESTADOS_ESTACION = {
  cerrada: { nombre: 'Cerrada', color: '#FF4D4F' },
  abierta: { nombre: 'Abierta', color: '#EDEDED' },
};

const MIN = 60_000;

/** Estado de un tramo: {estado, nivel:'oficial'|'confirmado'|'sin_confirmar'|'sin_reportes', personas, ultimo, pesos} */
export function estadoTramo(reportes, ahora = Date.now(), reglas = REGLAS) {
  const oficiales = reportes.filter(r => r.fuente === 'oficial' && ahora - r.t <= reglas.oficialMin * MIN && r.t <= ahora)
    .sort((a, b) => b.t - a.t);
  const vigentes = reportes.filter(r => r.fuente !== 'oficial' && r.t <= ahora && ahora - r.t <= reglas.vigenciaMin * MIN);
  // un voto por persona: su reporte más reciente
  const porAutor = new Map();
  for (const r of vigentes) if (!porAutor.has(r.autor) || porAutor.get(r.autor).t < r.t) porAutor.set(r.autor, r);
  const votos = [...porAutor.values()];
  const pesos = {};
  for (const r of votos) {
    const edadMin = (ahora - r.t) / MIN;
    pesos[r.estado] = (pesos[r.estado] || 0) + Math.pow(0.5, edadMin / reglas.vidaMediaMin) * (r.ubicado ? reglas.pesoUbicado : 1);
  }
  const ultimo = votos.length ? Math.max(...votos.map(r => r.t)) : null;
  // motivo: el de más peso entre quienes votaron ese estado (y dijeron por qué)
  const motivoDe = estado => {
    const m = {};
    for (const r of votos) if (r.estado === estado && Object.hasOwn(MOTIVOS, r.motivo || ''))
      m[r.motivo] = (m[r.motivo] || 0) + Math.pow(0.5, (ahora - r.t) / MIN / reglas.vidaMediaMin) * (r.ubicado ? reglas.pesoUbicado : 1);
    return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };

  if (oficiales.length) {
    const o = oficiales[0];
    return { estado: o.estado, nivel: 'oficial', personas: votos.length, ultimo: Math.max(o.t, ultimo || 0), pesos, oficial: o,
      motivo: Object.hasOwn(MOTIVOS, o.motivo || '') ? o.motivo : null };
  }
  if (!votos.length) return { estado: null, nivel: 'sin_reportes', personas: 0, ultimo: null, pesos };

  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  // gana el de más peso; a igualdad, el más grave (mejor avisar de más que de menos)
  const [estado, peso] = Object.entries(pesos)
    .sort((a, b) => (b[1] - a[1]) || (ESTADOS[b[0]].orden - ESTADOS[a[0]].orden))[0];
  const personas = votos.filter(r => r.estado === estado).length;
  const confirmado = personas >= reglas.minPersonas && peso / total >= reglas.mayoria;
  return { estado, nivel: confirmado ? 'confirmado' : 'sin_confirmar', personas, total: votos.length, ultimo, pesos,
    motivo: estado === 'normal' ? null : motivoDe(estado) };
}

/** Estado de todos los tramos: { t01: {...}, t02: {...} } */
export function estadoLinea(linea, reportes, ahora = Date.now(), reglas = REGLAS) {
  const porTramo = {};
  for (const r of reportes) (porTramo[r.tramo] ||= []).push(r);
  return Object.fromEntries(linea.tramos.map(t => [t.id, estadoTramo(porTramo[t.id] || [], ahora, reglas)]));
}

/**
 * Estado de una estación a partir de reportes { estacion, estado:'cerrada'|'abierta', t, autor, ubicado? }.
 * Un cierre dura horas y casi nadie pasa por una estación cerrada, así que no sirven las reglas de los tramos:
 *  - cada reporte cuenta 60 min y pierde la mitad de su peso cada 20 min;
 *  - un voto por persona (el último); «cerrada» queda confirmada con 2 personas y el 60 % del peso;
 *  - quien avisa que ya abrió resta: si «abierta» pesa más, la estación no se marca.
 * Devuelve {estado:'cerrada'|null, nivel:'confirmado'|'sin_confirmar'|'sin_reportes', personas, ultimo}.
 */
export function estadoEstacion(reportes, ahora = Date.now(), reglas = REGLAS) {
  const vigentes = reportes.filter(r => r.t <= ahora && ahora - r.t <= reglas.estacionMin * MIN && Object.hasOwn(ESTADOS_ESTACION, r.estado));
  const porAutor = new Map();
  for (const r of vigentes) if (!porAutor.has(r.autor) || porAutor.get(r.autor).t < r.t) porAutor.set(r.autor, r);
  const votos = [...porAutor.values()];
  if (!votos.length) return { estado: null, nivel: 'sin_reportes', personas: 0, ultimo: null };
  const peso = { cerrada: 0, abierta: 0 };
  for (const r of votos) peso[r.estado] += Math.pow(0.5, (ahora - r.t) / MIN / reglas.estacionVidaMediaMin) * (r.ubicado ? reglas.pesoUbicado : 1);
  const cierran = votos.filter(r => r.estado === 'cerrada');
  const ultimo = Math.max(...votos.map(r => r.t));
  if (!cierran.length || peso.abierta >= peso.cerrada) return { estado: null, nivel: 'sin_reportes', personas: 0, ultimo, abierta: true };
  const confirmado = cierran.length >= reglas.minPersonas && peso.cerrada / (peso.cerrada + peso.abierta) >= reglas.mayoria;
  return { estado: 'cerrada', nivel: confirmado ? 'confirmado' : 'sin_confirmar', personas: cierran.length,
    ultimo: Math.max(...cierran.map(r => r.t)) };
}

/** Estado de todas las estaciones de una línea: { 'l1-la-cultura': {...}, ... } */
export function estadoEstaciones(linea, reportes, ahora = Date.now(), reglas = REGLAS) {
  const por = {};
  for (const r of reportes) if (r.estacion) (por[r.estacion] ||= []).push(r);
  return Object.fromEntries(linea.estaciones.map(e => [e.id, estadoEstacion(por[e.id] || [], ahora, reglas)]));
}

/**
 * Resumen para el titular: agrupa tramos contiguos con el mismo problema confirmado (u oficial).
 * Devuelve {tipo:'normal'|'problemas'|'sin_datos', grupos:[{estado, desde, hasta, tramos, personas, ultimo, nivel, motivo}]}
 * El motivo del grupo es el que más tramos comparten (a igualdad, el del primero).
 */
export function resumen(linea, estados) {
  const grupos = [];
  let actual = null;
  linea.tramos.forEach(t => {
    const e = estados[t.id];
    const problema = e.estado && e.estado !== 'normal' && (e.nivel === 'confirmado' || e.nivel === 'oficial');
    if (problema && actual && actual.estado === e.estado) {
      actual.hasta = t.hasta; actual.tramos.push(t.id); actual.personas += e.personas;
      actual.ultimo = Math.max(actual.ultimo, e.ultimo); if (e.nivel === 'oficial') actual.nivel = 'oficial';
      actual.motivos.push(e.motivo);
    } else if (problema) {
      actual = { estado: e.estado, desde: t.desde, hasta: t.hasta, tramos: [t.id], personas: e.personas, ultimo: e.ultimo, nivel: e.nivel, motivos: [e.motivo] };
      grupos.push(actual);
    } else actual = null;
  });
  for (const g of grupos) {
    const n = {};
    for (const m of g.motivos) if (m) n[m] = (n[m] || 0) + 1;
    g.motivo = Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;   // sort estable: a igualdad, el primero
    delete g.motivos;
  }
  const conDatos = Object.values(estados).some(e => e.nivel !== 'sin_reportes');
  return { tipo: grupos.length ? 'problemas' : conDatos ? 'normal' : 'sin_datos', grupos };
}

/* ---------- ubicación: ¿en qué tramo está el usuario? ---------- */

function distPuntoSegmento(p, a, b) {
  // en metros, con proyección equirectangular centrada en p (sobra para Lima)
  const k = Math.cos(p[1] * Math.PI / 180), R = 6371000 * Math.PI / 180;
  const ax = (a[0] - p[0]) * k * R, ay = (a[1] - p[1]) * R, bx = (b[0] - p[0]) * k * R, by = (b[1] - p[1]) * R;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + u * dx, ay + u * dy);
}

/** Tramo más cercano a [lon, lat] y su distancia en metros. */
export function tramoCercano(linea, punto) {
  let mejor = { tramo: null, metros: Infinity };
  for (const t of linea.tramos) {
    for (let i = 1; i < t.coords.length; i++) {
      const d = distPuntoSegmento(punto, t.coords[i - 1], t.coords[i]);
      if (d < mejor.metros) mejor = { tramo: t, metros: d };
    }
  }
  return mejor;
}

/** Tramo más cercano entre varias líneas: {linea, tramo, metros}. */
export function tramoCercanoRed(lineas, punto) {
  let mejor = { linea: null, tramo: null, metros: Infinity };
  for (const l of lineas) {
    const c = tramoCercano(l, punto);
    if (c.metros < mejor.metros) mejor = { linea: l, ...c };
  }
  return mejor;
}

/* ---------- ¿dónde está quien reporta? (para elegir el tramo solo) ---------- */
export const CERCANIA = { enVia: 400, enEstacion: 200, sugerencia: 1500 };   // metros

function distM(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), R = 6371000 * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * k * R, (b[1] - a[1]) * R);
}

/**
 * Ubica un punto [lon, lat] en la red.
 * Devuelve { tipo, linea, estacion, metrosEstacion, tramo, metrosVia, opciones }:
 *  - tipo 'estacion'  → a menos de 200 m de una estación: opciones = sus tramos vecinos (1 o 2), el primero es el más probable
 *  - tipo 'via'       → a menos de 400 m de la vía, entre estaciones: opciones = [ese tramo]
 *  - tipo 'cerca'     → fuera de la vía pero a menos de 1,5 km de una estación: se sugiere, no se da por ubicado
 *  - tipo 'lejos'     → nada cerca: elegir a mano
 */
export function ubicarEnRed(lineas, punto, c = CERCANIA) {
  const via = tramoCercanoRed(lineas, punto);
  let est = { linea: null, estacion: null, metros: Infinity };
  for (const l of lineas) for (const e of l.estaciones) {
    const m = distM(punto, [e.lon, e.lat]);
    if (m < est.metros) est = { linea: l, estacion: e, metros: m };
  }
  const vecinos = est.linea ? est.linea.tramos.filter(t => t.desde === est.estacion.id || t.hasta === est.estacion.id) : [];
  // el tramo más probable primero: el que pasa más cerca del punto
  const orden = ts => ts.map(t => ({ t, m: tramoCercano({ tramos: [t] }, punto).metros })).sort((a, b) => a.m - b.m).map(x => x.t);
  const base = { linea: via.linea, estacion: est.estacion, metrosEstacion: Math.round(est.metros), tramo: via.tramo, metrosVia: Math.round(via.metros) };
  if (est.metros <= c.enEstacion) return { ...base, tipo: 'estacion', linea: est.linea, opciones: orden(vecinos), tramo: orden(vecinos)[0] };
  if (via.metros <= c.enVia) return { ...base, tipo: 'via', opciones: [via.tramo] };
  if (est.metros <= c.sugerencia) return { ...base, tipo: 'cerca', linea: est.linea, opciones: orden(vecinos), tramo: orden(vecinos)[0] };
  return { ...base, tipo: 'lejos', opciones: [] };
}
