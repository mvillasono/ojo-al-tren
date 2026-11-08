# Seguridad

Si encuentras una vulnerabilidad (por ejemplo, una forma de falsear reportes en masa, de ver datos
que no deberían ser públicos o de inyectar contenido en la página), **no abras un issue público**.

Repórtala en privado desde la pestaña **Security → Report a vulnerability** de este repositorio
(GitHub Private Vulnerability Reporting). Incluye:

- qué encontraste y cómo reproducirlo,
- qué impacto crees que tiene,
- si tienes, una idea de cómo arreglarlo.

Responderemos lo antes posible. Te pedimos no divulgarlo hasta que esté corregido; con gusto te
daremos el crédito en la corrección si así lo quieres.

## Notas

- El token de Mapbox que aparece en la página publicada es **público por diseño** (empieza con
  `pk.`) y está restringido a los dominios del proyecto: no es una vulnerabilidad.
- Las claves del servidor (base de datos, bots) viven solo en las variables de entorno de Vercel y
  nunca en el repositorio.
