# Contexto del proyecto

Plataforma web que lee los datos de redes y publicidad de un negocio, los analiza
con agentes de IA y, a partir de ahí, arma campañas, contenido y creativos.

**Cliente piloto:** 999 Motos (`https://999motos.com.ar`) · Director: Julián.
**Estado:** MVP, fase 1 de 5.

Leer [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md) antes de proponer
cualquier funcionalidad. Si no está en esa lista, no va en el MVP.

## Reglas duras de la arquitectura

Vienen de [`docs/02-arquitectura.md`](docs/02-arquitectura.md). No se negocian
sin una entrada nueva en [`docs/06-decisiones.md`](docs/06-decisiones.md).

1. **La capa 2 (análisis) nunca llama a la API de Meta.** Si falta un dato, se
   arregla en la capa 1 (ingesta), no se sale a buscarlo.
2. **Al LLM se le mandan agregados de SQL, nunca filas crudas.** Postgres suma
   gratis y sin alucinar.
3. **Ningún agente gasta plata solo.** Todo lo que cueste dólares (imagen, video)
   se estima primero, se muestra en pantalla y se ejecuta después de un click
   humano.
4. **Ningún token va a la base de datos.** `cuentas_meta.token_ref` guarda el
   *nombre* de la variable de entorno, jamás el valor.
5. **Ningún cliente escribe en la base.** La escritura la hace el backend con la
   clave secreta (`sb_secret_…`). El cron y los agentes son el único camino de entrada.

## Convenciones

- **Idioma del código:** español, `snake_case` en la base, `camelCase` en TS.
  Tablas en plural.
- **Toda tabla de ingesta** lleva `organizacion_id` y una columna `crudo jsonb`
  con la respuesta original de Meta.
- **Versión de la Graph API:** pineada en `META_API_VERSION`. Nunca hardcodeada
  en una llamada.
- **Commits:** conventional commits, en español, sin atribución de IA.

## TDD estricto

Es obligatorio en este proyecto:

1. Test que falla primero.
2. El código mínimo que lo hace pasar.
3. Refactor con los tests en verde.

No se escribe implementación sin un test que la reclame. `pnpm test` tiene que
estar en verde antes de cada commit.

## Trabajo externo

Federico hace **todo** lo que toca plataformas externas: crear el proyecto en
Vercel y en Supabase, cargar variables de entorno, aplicar migraciones, `git push`.

Acá se entrega el repo listo y se le dice exactamente qué crear y con qué nombres
de variable. Nunca se piden valores de secretos.

## Mapa de documentos

| Archivo | Para qué |
|---|---|
| `docs/01-alcance-mvp.md` | Qué entra y qué no. El borde del trabajo. |
| `docs/02-arquitectura.md` | Las tres capas y la compuerta de costo |
| `docs/03-esquema-bdd.md` | Modelo de datos y el porqué de cada decisión |
| `docs/04-meta-integracion.md` | Permisos, tokens, endpoints, límites, fechas críticas |
| `docs/05-costos-ia.md` | Precios por motor y cómo se estima el gasto |
| `docs/06-decisiones.md` | Bitácora de decisiones (ADR) + riesgos abiertos |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
