# 05 · Costos de IA

> **Imagen:** precios oficiales de Google (https://ai.google.dev/gemini-api/docs/pricing,
> actualizada el 19-oct-2026, consultada el 21-oct-2026). Viven en
> `lib/productor/precios.ts`, que es la única fuente: el servidor, el catálogo y
> el simulador leen de ahí.
> **Video:** sigue saliendo de comparativas públicas del 22-sep-2026 y es
> **referencial**: no se puede generar todavía. Antes de comprometer un número de
> video con el cliente, confirmarlo contra la página oficial y sumar un 20% de colchón.

## La regla del proyecto

> Todo lo que es texto cuesta centavos. Todo lo que es imagen o video cuesta
> dólares. Por eso lo que cuesta dólares vive detrás de un click humano.

## Imagen — precios oficiales (1K)

El Productor (ADR-022) usa la Gemini API. Solo se genera a **1K** (1024 px de lado
mayor), una imagen por request.

| Motor | Id | USD / imagen (1K) | Uso |
|---|---|---|---|
| Nano Banana 2.1 | `gemini-nano-banana-2.1` | **0,0336** | **Por defecto.** Barato y rápido |
| Gemini 3 Pro Image | `gemini-3-pro-image` | 0,134 | Pieza final, solo si se justifica |

Cómo cobra Google (US$ por millón de tokens): una imagen 1K son 1120 tokens de
salida de imagen, y además se cobra la **entrada** y el **texto y pensamiento** de
salida.

| Motor | Entrada | Salida de texto y pensamiento | Salida de imagen |
|---|---|---|---|
| Nano Banana 2.1 | 1,50 | 7,50 | 30,00 (1120 tokens = 0,0336) |
| Gemini 3 Pro Image | 2,00 | 12,00 | 120,00 (1120 tokens ≈ 0,134) |

**Qué se muestra y qué se cobra.** La pantalla muestra el precio de lista por
imagen y un **tope** que suma, por imagen, 1500 tokens de entrada y un presupuesto
de pensamiento (1000 tokens en Nano Banana 2.1, 4000 en Pro). Ese tope es lo que se
guarda como `costo_estimado_usd` y lo que cuenta contra el tope mensual: es
conservador a propósito. En Nano Banana 2.1 se pide `thinking_level: minimal` para
bajarlo. El **costo real** sale de los tokens que informa `usage` en la respuesta;
si Google no manda `usage`, se registra la tarifa fija por imagen. Siempre queda un
número, nunca `null`.

| Motor | Lista por imagen | Tope por imagen |
|---|---|---|
| Nano Banana 2.1 | US$ 0,0336 | US$ 0,04335 |
| Gemini 3 Pro Image | US$ 0,134 | US$ 0,185 |

**Modelos que no se usan** (según la misma página): `imagen-4.0-generate` está
apagado; `gemini-3.1-flash-lite-image` (US$ 0,0336, solo 1K) y
`gemini-3.1-flash-image` (US$ 0,067) existen pero no están cargados; 
`gemini-2.5-flash-image` es legacy. Un modelo que no figura en
`lib/productor/precios.ts` **no se puede usar**: el servidor devuelve error antes
de cualquier llamada.

**Otras condiciones del servicio:** todas las imágenes llevan SynthID; la API
Batch cuesta 50% menos pero tarda hasta 24 h (no se usa); con `store` en true
Google guarda la interacción 55 días, por eso el Productor manda `store: false`.

## Video — precio por segundo (referencial, no disponible)

| Motor | USD / segundo | Nota |
|---|---|---|
| Runway Gen-4 Turbo | 0,05 | Referencia de arranque |
| Kling 3.0 | 0,09 – 0,14 | Buen equilibrio |
| Sora 2 (base) | 0,10 | Buen equilibrio |
| Gemini Omni 1.1 Flash | ~0,10 (720p) | Reemplaza a Veo 3.1 |
| Runway Gen-4.5 | 0,12 | Calidad alta |
| Sora 2 Pro | 0,30 – 0,50 | Pieza premium |

**Veo 3.1** (las tres variantes, en preview) **se apaga el 22-oct-2026** y salió del
catálogo. El video es un cambio aparte; la pantalla lo marca "referencial, no
disponible".

## Por qué el estimador es una funcionalidad y no un adorno

Un mes de contenido para 999 Motos: **20 imágenes + 4 videos de 8 segundos**
(precios de lista; el video es referencial).

| Configuración | Cuenta | Total del mes | Al año |
|---|---|---|---|
| **Económica** — Nano Banana 2.1 + Runway Gen-4 Turbo | 20 × 0,0336 + 32 × 0,05 | **USD 2,27** | USD 27 |
| **Premium** — Gemini 3 Pro Image + Sora 2 Pro | 20 × 0,134 + 32 × 0,30 | **USD 12,28** | USD 147 |

**Más de cinco veces de diferencia por el mismo mes de contenido.** Solo las
imágenes: 20 con Nano Banana 2.1 son USD 0,67; con Pro, USD 2,68 (cuatro veces).

Esa es toda la razón de existir de la compuerta de costo y del selector de motor.
No es una pantalla linda: es la diferencia entre que Julián gaste unos pocos
dólares al año o varias veces más sin entender por qué. Los dos casos están
vigilados por `lib/creativos/motores.test.ts`.

## El tope mensual

`PRESUPUESTO_MENSUAL_USD` es el tope de gasto en imágenes por mes calendario (hora
de Buenos Aires). **Sin esa variable el Productor está apagado.** El gasto del mes
es el costo real de lo ya generado más el estimado de lo que está en vuelo; si
gastado + estimado supera el tope, el servidor responde 402 sin llamar a Google.
Para 999 Motos un tope de **USD 10** cubre ~230 imágenes con Nano Banana 2.1 al
tope por imagen.

## Estrategia de escalado: barato primero, caro con evidencia

Decisión de Federico, y es la correcta: se arranca con lo económico y se sube por
prueba y error. Para que "prueba y error" no sea tirar plata a ciegas, cada
generación escribe en la tabla `generaciones`:

- qué motor se usó
- el costo estimado **antes** de ejecutar
- el costo real **después**
- quién lo confirmó y cuándo

A los dos meses eso responde la única pregunta que importa: *¿la imagen de USD 0,134
de Pro rindió cuatro veces más que la de USD 0,0336 de Nano Banana?* Si la respuesta es
no, se sigue con el barato. Con datos, no con opinión.

## Costo del MVP: prácticamente cero

El MVP no genera imágenes. Los agentes de texto trabajan sobre agregados:

| Concepto | Estimación |
|---|---|
| Análisis por ejecución (OpenAI `gpt-6-luna`, agregados, no filas crudas) | ~USD 0,001 – 0,0015 |
| Plan de campaña del Estratega (`gpt-6-luna`, texto del análisis + brief) | ~USD 0,002 |
| Una semana del Contenidista (`gpt-6-luna`, texto del plan + notas; tope ~USD 0,004 con 8000 tokens de salida) | ~USD 0,002 |
| Editar, aprobar o descartar un plan o una pieza | USD 0 |
| Ejecuciones reales por mes (con caché activo) | 20 – 40 |
| **Total mensual de IA del MVP** | **menos de USD 1** |

Tres cosas mantienen ese número tan bajo, y las tres son decisiones de diseño:

1. **Agregados en SQL, no filas crudas al modelo.** Postgres suma gratis. Un mes
   de publicaciones pasa de ~40.000 tokens a ~1.500.
2. **Caché por hash.** Un período que ya pasó no cambia: se paga una sola vez por
   más que se abra el tablero cincuenta veces.
3. **Modelo económico por defecto.** `gpt-6-luna` (US$ 0,10 por millón de tokens
   de entrada y US$ 0,50 de salida, según developers.openai.com/api/docs/pricing
   el 20-oct-2026) alcanza de sobra para interpretar agregados. Se sube de modelo cuando haya evidencia de que hace falta, no por
   las dudas.

## Costos de infraestructura

| Servicio | Plan | USD / mes |
|---|---|---|
| Vercel | Hobby / Pro | 0 – 20 |
| Supabase | Free / Pro | 0 – 25 |
| MCP de Meta Ads | Beta abierta | 0 |
| IA (MVP, texto) | — | < 1 |
| IA (Productor, imágenes) | Tope mensual | hasta `PRESUPUESTO_MENSUAL_USD` |

⚠️ El MCP de Meta Ads es gratis **durante la beta** y Meta no anunció precio
futuro. Está registrado como riesgo en [`06-decisiones.md`](06-decisiones.md).

## Fuentes

- [Gemini API · Pricing](https://ai.google.dev/gemini-api/docs/pricing) — imagen (oficial, verificado el 2026-10-19)
- [OpenAI · Pricing](https://developers.openai.com/api/docs/pricing) — texto (oficial, verificado el 2026-10-20)
- [AI Video API Pricing 2026](https://apiframe.ai/blog/ai-video-api-pricing-2026) — video (comparativa)
- [Veo 3.1 vs Kling 3.0 vs Sora 2 — costos de API 2026](https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026) — video (comparativa)
