# 05 · Costos de IA

> Precios relevados el 22 de septiembre de 2026 sobre comparativas públicas.
> **Antes de comprometer un número con el cliente, confirmarlos contra la página
> oficial de cada proveedor y sumarles un 20% de colchón.**

## La regla del proyecto

> Todo lo que es texto cuesta centavos. Todo lo que es imagen o video cuesta
> dólares. Por eso lo que cuesta dólares vive detrás de un click humano.

## Imagen — precio por unidad

| Motor | USD / imagen | Uso sugerido |
|---|---|---|
| GPT Image 2 | 0,002 – 0,003 | Pruebas, borradores, volumen |
| Flux 2 Pro | 0,02 | **Arranque del proyecto** |
| Seedream 4.5 | 0,04 | Alternativa de estilo |
| Imagen 4 | 0,05 | Calidad alta |
| Nano Banana Pro | 0,20 | Pieza final, solo si se justifica |

## Video — precio por segundo

| Motor | USD / segundo | Uso sugerido |
|---|---|---|
| Runway Gen-4 Turbo | 0,05 | **Arranque del proyecto** |
| Kling 3.0 | 0,09 – 0,14 | Buen equilibrio |
| Sora 2 (base) | 0,10 | Buen equilibrio |
| Runway Gen-4.5 | 0,12 | Calidad alta |
| Veo 3.1 Fast | 0,15 | Borradores con audio |
| Sora 2 Pro | 0,30 – 0,50 | Pieza premium |
| Veo 3.1 Standard | 0,75 | 4K, mejor sincronía labial, audio nativo |

## Por qué el estimador es una funcionalidad y no un adorno

Un mes de contenido para 999 Motos: **20 imágenes + 4 videos de 8 segundos**.

| Configuración | Cuenta | Total del mes | Al año |
|---|---|---|---|
| **Económica** — Flux 2 Pro + Runway Gen-4 Turbo | 20 × 0,02 + 32 × 0,05 | **USD 2,00** | USD 24 |
| **Premium** — Nano Banana Pro + Veo 3.1 Standard | 20 × 0,20 + 32 × 0,75 | **USD 28,00** | USD 336 |

**Catorce veces de diferencia por el mismo mes de contenido.**

Esa es toda la razón de existir de la compuerta de costo y del selector de motor.
No es una pantalla linda: es la diferencia entre que Julián gaste 24 dólares al
año o 336 sin entender por qué.

## Estrategia de escalado: barato primero, caro con evidencia

Decisión de Federico, y es la correcta: se arranca con lo económico y se sube por
prueba y error. Para que "prueba y error" no sea tirar plata a ciegas, cada
generación escribe en la tabla `generaciones`:

- qué motor se usó
- el costo estimado **antes** de ejecutar
- el costo real **después**
- quién lo confirmó y cuándo

A los dos meses eso responde la única pregunta que importa: *¿el video de USD 6
de Veo rindió catorce veces más que el de USD 0,40 de Runway?* Si la respuesta es
no, se sigue con el barato. Con datos, no con opinión.

## Costo del MVP: prácticamente cero

El MVP no genera nada. Un solo agente de texto sobre agregados:

| Concepto | Estimación |
|---|---|
| Análisis por ejecución (Haiku 4.5, agregados, no filas crudas) | ~USD 0,01 |
| Ejecuciones reales por mes (con caché activo) | 20 – 40 |
| **Total mensual de IA del MVP** | **menos de USD 1** |

Tres cosas mantienen ese número tan bajo, y las tres son decisiones de diseño:

1. **Agregados en SQL, no filas crudas al modelo.** Postgres suma gratis. Un mes
   de publicaciones pasa de ~40.000 tokens a ~1.500.
2. **Caché por hash.** Un período que ya pasó no cambia: se paga una sola vez por
   más que se abra el tablero cincuenta veces.
3. **Modelo económico por defecto.** Haiku 4.5 alcanza de sobra para interpretar
   agregados. Se sube de modelo cuando haya evidencia de que hace falta, no por
   las dudas.

## Costos de infraestructura

| Servicio | Plan | USD / mes |
|---|---|---|
| Vercel | Hobby / Pro | 0 – 20 |
| Supabase | Free / Pro | 0 – 25 |
| MCP de Meta Ads | Beta abierta | 0 |
| IA (MVP) | — | < 1 |

⚠️ El MCP de Meta Ads es gratis **durante la beta** y Meta no anunció precio
futuro. Está registrado como riesgo en [`06-decisiones.md`](06-decisiones.md).

## Fuentes

- [AI Video API Pricing 2026](https://apiframe.ai/blog/ai-video-api-pricing-2026)
- [Veo 3.1 vs Kling 3.0 vs Sora 2 — costos de API 2026](https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026)
- [AI Image Generation API Pricing (jul 2026)](https://www.buildmvpfast.com/api-costs/ai-image)
- [AI Image Pricing 2026: Google vs OpenAI](https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai)
