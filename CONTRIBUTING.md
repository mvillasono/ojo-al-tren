# Cómo colaborar con Ojo al Tren

¡Gracias por querer ayudar! Ojo al Tren es un proyecto cívico y gratuito: cualquier mejora que haga
más fácil saber cómo está el Metro de Lima suma. No hace falta ser programador: avisar de un error,
de una estación nueva o de un dato mal puesto también es colaborar.

## Formas de ayudar

- **Avisar de un problema**: abre un [issue](../../issues/new/choose) con la plantilla de error.
- **Cambios en las líneas**: si abrió una estación, cambió un nombre o el trazado está mal, usa la
  plantilla «Cambio en la línea». Los datos vienen de OpenStreetMap: a veces lo mejor es corregirlo
  allá (ver más abajo).
- **Ideas**: plantilla «Idea». Cuéntanos qué problema resuelve para quien viaja.
- **Código**: busca los issues con la etiqueta `buena primera tarea` para empezar.

## Ramas

| Rama | Para qué |
|---|---|
| `dev` | Rama principal. **Todos los PR van aquí.** |
| `prod` | Lo que está publicado. Solo recibe merges desde `dev`, los hace el equipo. |

Nadie sube cambios directo a `dev` ni a `prod`: todo entra por pull request con las pruebas en verde.

## Preparar el proyecto en tu PC

Requisitos: [Node.js 20+](https://nodejs.org) y, solo para regenerar las líneas, Python 3.10+.

```bash
git clone https://github.com/mvillasono/ojo-al-tren.git
cd ojo-al-tren
cp .env.example .env      # opcional: tu token público de Mapbox; sin token se usa OpenFreeMap
npm run dev               # http://localhost:3001
npm test                  # pruebas de la lógica (lib/estado.js)
```

No hay dependencias que instalar: el sitio es HTML, CSS y JavaScript sin framework.

## Hacer un cambio

1. Haz un *fork* del repositorio y crea una rama desde `dev`: `git checkout -b arregla-tal-cosa dev`.
2. Haz el cambio. Si tocas `lib/estado.js`, agrega o ajusta pruebas en `tests/`.
3. Corre `npm test` y `npm run build`.
4. Abre el pull request **contra `dev`** y completa la plantilla.

### Estilo

- Todo en **español**: textos de la interfaz, comentarios, nombres de variables y mensajes de commit.
- Textos para la gente: claros, cortos y sin jerga técnica. Nunca presentar como oficial algo que
  viene de usuarios.
- Paleta: el color solo aparece cuando hay algo que mirar (ver `ESTADOS` en `lib/estado.js`).
- Accesibilidad: que se pueda usar con teclado y lector de pantalla, y que respete
  `prefers-reduced-motion`.

## Datos de las líneas (OpenStreetMap)

`data/lineas.json` se genera con `npm run linea` a partir de las relaciones de OpenStreetMap
(L1: [1408101](https://www.openstreetmap.org/relation/1408101), L2:
[16861884](https://www.openstreetmap.org/relation/16861884)). Si una estación o un tramo está mal,
**lo ideal es corregirlo en OpenStreetMap** (así se arregla para todos) y luego regenerar el archivo
en un PR. Estos datos están bajo la licencia ODbL y siempre deben llevar la atribución
«© colaboradores de OpenStreetMap».

## Lo que nunca va al repositorio

- Archivos `.env`, tokens, claves o URLs de bases de datos (aunque sean «de prueba»).
- Reportes de usuarios ni datos personales de nadie.
- Material con marca de Línea 1, Línea 2, la ATU u otras entidades: Ojo al Tren no está afiliado a ellas.

## Licencia de tus aportes

Al enviar un pull request aceptas que tu aporte se publique bajo la misma licencia del proyecto
(AGPL-3.0-or-later para el código; ODbL para los datos de OpenStreetMap). Ver [LICENSE](LICENSE) y
la sección «Licencia» del [README](README.md).

## Conducta

Este proyecto sigue un [código de conducta](CODE_OF_CONDUCT.md). Trata a los demás con respeto.
