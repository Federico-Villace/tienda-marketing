# Agencia de marketing con agentes — plataforma web

Plataforma que lee los datos de redes sociales y publicidad de un negocio, los
analiza con agentes de IA, y a partir de ese análisis arma campañas, contenido y
creativos — con el gasto de generación siempre bajo control humano.

**Cliente piloto:** 999 Motos (`https://999motos.com.ar`) · Director: Julián.

## Estado

🟡 **MVP en construcción.** Fase 1 de 5. Ver [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md).

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Web | Next.js (App Router) + TypeScript | Deploy directo a Vercel, server actions para no exponer tokens |
| Hosting | Vercel | Ya usado por el cliente |
| Datos + Auth + Storage | Supabase | El cliente ya tiene proyecto; Postgres real, RLS, sin vendor lock-in de datos |
| Tests | Vitest | TDD estricto: test primero, siempre |
| Datos de Meta (ads) | MCP oficial de Meta Ads | Meta lo hospeda, 29 tools, sin código propio |
| Datos de Meta (orgánico) | Graph API | No hay MCP para orgánico |
| Modelos de IA | Arranque económico, escala por medición | Ver [`docs/05-costos-ia.md`](docs/05-costos-ia.md) |

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md) | Qué entra y qué NO entra en el MVP |
| [`docs/02-arquitectura.md`](docs/02-arquitectura.md) | Las tres capas y la compuerta de costo |
| [`docs/03-esquema-bdd.md`](docs/03-esquema-bdd.md) | Modelo de datos y decisiones del esquema |
| [`docs/04-meta-integracion.md`](docs/04-meta-integracion.md) | Permisos, tokens, endpoints, límites |
| [`docs/05-costos-ia.md`](docs/05-costos-ia.md) | Precios por motor y cómo se estima el gasto |
| [`docs/06-decisiones.md`](docs/06-decisiones.md) | Bitácora de decisiones técnicas (ADR) |

## Puesta en marcha

```bash
pnpm install
cp env.example .env.local     # completar con los valores reales
pnpm test                      # los tests tienen que pasar antes de tocar nada
pnpm dev
```

> Los valores de `.env.local` nunca se commitean ni se comparten por chat.
