# Notas de Moderación (Vercel)

Herramienta privada del staff para redactar notas de moderación con formato de Discord.

- `index.html`: pantalla de acceso (lo único público).
- `api/index.js`: servidor (Vercel Function). Comprueba códigos, sesiones y guarda los datos en Upstash Redis.
- `api/_app.js`: la aplicación; solo se entrega a usuarios con sesión iniciada.
- `src/` + `build.mjs`: código fuente. Tras modificarlo: `node build.mjs`.

Requiere conectar una base de datos **Upstash Redis** al proyecto en Vercel (Storage) para que existan las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
