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

**Editar una foto (ADR-023).** Mandar la foto como imagen de entrada suma tokens de
entrada, que se presupuestan en el tope (`tokensImagenEntrada` en
`lib/productor/precios.ts`):

| Motor | Tokens de la foto | Origen | Tope por imagen con foto |
|---|---|---|---|
| Nano Banana 2.1 | 1120 | **Supuesto conservador** (el máximo de `media_resolution` por defecto; Google no lo publica) | US$ 0,04503 |
| Gemini 3 Pro Image | 560 | Oficial: "560 tokens or $0.0011 per image" ([pricing](https://ai.google.dev/gemini-api/docs/pricing), verificado el 22-oct-2026) | US$ 0,18612 |

La cuenta de Nano Banana 2.1: 0,0336 + (1500 + 1120) × 1,5 / 1e6 + 1000 × 7,5 / 1e6 =
0,04503. Ejemplo: **2 variantes con Nano Banana 2.1 = tope US$ 0,09006** (en la
pantalla: "Confirmar US$ 0,09006"; el precio de lista es US$ 0,0672). El costo real
sigue saliendo de `usage.total_input_tokens`, que ya incluye la imagen: en la
prueba (`docs/08` sección 15) se compara con los 1120 presupuestados.

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

## Costo de una promoción típica (ADR-027)

| Paso | Qué hace | Costo aproximado |
|---|---|---|
| 2 | Análisis de 90 días de la marca (texto) | ~US$ 0,002 |
| 3 | 3 textos (texto) | ~US$ 0,003 (otras 3: otro ~US$ 0,003) |
| 4 | Escena de Gemini, 2 variantes con la foto de entrada | ~US$ 0,09 al tope; el costo real es menor |
| 4 | Componer la placa (satori) | gratis |
| 5 y 6 | Aprobar, descargar, copiar | gratis |
| | **Total** | **~US$ 0,09 por promoción** |

Los pasos 2 y 3 muestran su precio aproximado en el botón (se calcula con los
precios de `lib/agentes/precios.ts` y un tamaño típico de llamada; el costo real se
registra al terminar). El paso 4 usa la compuerta de siempre: "Ver precio" y
"Confirmar US$ X", con el tope mensual. Con el tope de USD 10 entran ~100
promociones por mes.

### Costo de una tanda (ADR-028)

Una promoción para N marcas no cuesta N veces: la escena de Gemini es una sola (el
prompt no usa la marca) y la marca va en el texto de la placa, que es gratis. Con las 7
marcas: análisis 7 × ~US$ 0,002 + textos 7 × ~US$ 0,003 + 1 escena ~US$ 0,04 ≈ **US$ 0,08**,
contra 7 × ~US$ 0,09 = **US$ 0,63** si cada marca generara la suya. Los botones de lote
muestran el total antes del click (`~US$ 0,014 (7 × ~US$ 0,002)`) y la imagen sigue por
Ver precio → Confirmar US$ X, con el aviso de cuánto saldría una imagen por marca. El
análisis del Analista con varias marcas es un solo pedido (compara y suma), de costo
similar al de una marca.

### Costo de la foto de inspiración (ADR-030)

La foto de inspiración es una **segunda imagen de entrada** en el pedido de la escena. No
cambia el precio de lista por imagen: sube solo el **tope** que presupuesta la compuerta, por
los tokens de entrada de esa imagen (Nano Banana 2.1: 1.120 tokens × US$ 1,50 por millón ≈
+US$ 0,0017 por imagen; Gemini 3 Pro Image: 560 × US$ 2 por millón ≈ +US$ 0,0011). Con 2
variantes, la escena de una promoción pasa de ~US$ 0,090 a ~US$ 0,093 al tope; el costo real se
registra de `usage` al terminar y es menor. El botón muestra el total ya incluido
("Confirmar US$ X · Incluye la foto de inspiración"). En una tanda es UNA imagen para las N
marcas, así que la inspiración se paga una vez. Los 1.120 tokens de NB2.1 siguen siendo un
supuesto (R13): se compara con el `usage` real en `docs/08` sección 22.

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
