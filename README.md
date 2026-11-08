# Ojo al Tren

[![Verificar](https://github.com/mvillasono/ojo-al-tren/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/mvillasono/ojo-al-tren/actions/workflows/ci.yml)
[![Licencia: AGPL-3.0](https://img.shields.io/badge/c%C3%B3digo-AGPL--3.0-blue)](LICENSE)
[![Datos: ODbL](https://img.shields.io/badge/datos-ODbL%20(OpenStreetMap)-green)](https://opendatacommons.org/licenses/odbl/)

**¿Cómo está el tren ahora?** Estado de las **Líneas 1 y 2 del Metro de Lima**, tramo por tramo,
según los reportes de quienes viajan en ellas: normal, lento, detenido o sin servicio.

Proyecto cívico, gratuito y de **código libre**. No está afiliado a Línea 1, Línea 2 ni a la ATU:
la información viene de usuarios y siempre se muestra como tal.

> **Estado: prototipo.** Los reportes se guardan solo en el navegador y hay un **modo demo** con
> escenarios simulados. El siguiente paso es compartirlos entre usuarios (ver «Hoja de ruta»).

## Cómo funciona

- El mapa muestra cada línea dividida en **tramos entre estaciones** (25 en la Línea 1, 4 en la Línea 2).
- Quien viaja toca **Reportar**: la página lo ubica (si da permiso), elige el tramo por la estación
  más cercana y le pregunta cómo va el tren.
- El estado de cada tramo sale de los reportes de los últimos 20 minutos (`lib/estado.js`):
  - cada reporte vale menos con el tiempo (vida media de 6 min) y caduca a los 20 min;
  - un voto por persona y tramo; con ubicación sobre la vía pesa 1,5;
  - **confirmado** con al menos 2 personas y un estado con el 60 % del peso; si no, «sin confirmar»
    (línea punteada); a igualdad gana el estado más grave;
  - un aviso oficial manda durante 60 min.
- Paleta: el color solo aparece cuando hay algo que mirar. Normal es blanco; lento, ámbar;
  detenido, coral; sin servicio, acero; sin reportes, grafito.

## Correr en local

Requisitos: Node.js 20+ (y Python 3.10+ solo para regenerar las líneas).

```bash
cp .env.example .env      # opcional: tu token público de Mapbox (pk.…); vacío = OpenFreeMap
npm run dev               # arma dist/ y lo sirve en http://localhost:3001 (/, /linea-1, /linea-2)
npm test                  # pruebas de la lógica (consenso, caducidad, ubicación)
```

No hay dependencias que instalar: HTML, CSS y JavaScript sin framework.

## Colaborar

¡Se agradece cualquier ayuda! Lee [CONTRIBUTING.md](CONTRIBUTING.md). En corto:

- Errores, cambios en las líneas e ideas: abre un [issue](../../issues/new/choose).
- Código: fork → rama desde `dev` → pull request **contra `dev`**.
- Empieza por los issues con la etiqueta `buena primera tarea`.

### Ramas

| Rama | Para qué |
|---|---|
| `dev` | Rama principal: aquí llegan todos los pull requests. |
| `prod` | Lo publicado (Vercel la despliega). Solo recibe merges desde `dev`. |

Las dos están protegidas: todo entra por pull request con las pruebas en verde.

## Publicar (Vercel)

`vercel.json` ya está listo: build `npm run build`, salida `dist/`, rama de producción `prod`.
Variables: `MAPBOX_TOKEN` (público, restringido a tus dominios en mapbox.com), `PUBLIC_SITE_URL`
(opcional) y `DEMO=no` en producción. El build genera una página por ruta (`/`, `/linea-1`,
`/linea-2`) con título, descripción, canonical, Open Graph y JSON-LD, más `robots.txt`,
`sitemap.xml` y el manifest.

## Datos

`data/lineas.json` sale de OpenStreetMap: `npm run linea` lo regenera desde la API de OSM.

| Línea | Relación OSM | Estaciones | Tramos | Km |
|---|---|---|---|---|
| L1 · Villa El Salvador → Bayóvar | [1408101](https://www.openstreetmap.org/relation/1408101) | 26 | 25 | 33,3 |
| L2 · Mercado Santa Anita → Evitamiento | [16861884](https://www.openstreetmap.org/relation/16861884) | 5 | 4 | 4,2 |

El resto de la Línea 2 (en construcción) se dibuja punteado y no se puede reportar. Cuando abran
estaciones nuevas y OSM actualice la relación, basta con volver a correr `npm run linea`.

## Hoja de ruta

- [ ] API + base de datos para compartir los reportes entre usuarios (con límites anti-spam).
- [ ] Bot de WhatsApp: «¿cómo está el tren?» y «el tren está parado en Gamarra».
- [ ] Avisos oficiales de Línea 1 y Línea 2 cuando publiquen incidencias.
- [ ] Nuevas estaciones de la Línea 2 (Ate) cuando entren en operación.

## Licencia

- **Código**: [GNU AGPL-3.0-or-later](LICENSE). Puedes usarlo, estudiarlo, modificarlo y compartirlo;
  si publicas una versión modificada (también como sitio web), debes liberar su código con la misma
  licencia.
- **Datos de las líneas** (`data/lineas.json` y `data/osm/`): © colaboradores de OpenStreetMap,
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/). Cualquier uso debe
  mantener la atribución y compartir la base de datos derivada con la misma licencia.
- **Nombre y logo**: «Ojo al Tren» y su logotipo no están incluidos en la licencia del código. Si
  publicas tu propia versión, usa otro nombre y logo para que nadie la confunda con este proyecto.
