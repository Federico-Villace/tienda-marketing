# 06 · Bitácora de decisiones

Una entrada por decisión que costaría plata revertir. Orden cronológico inverso.

---

## ADR-008 · El alcance de la propuesta 2026-001 se entrega sin cargo
**22-sep-2026 · Decidido por Federico**

Las partes A (plugin, USD 300) y B (migración del e-commerce, USD 400) de la
propuesta `2026-001` se entregan sin cargo. Julián es cliente de confianza con
trabajo recurrente previsto; la inversión se recupera en los encargos siguientes.

**Consecuencia:** que sea sin cargo no vuelve el alcance ilimitado. El borde de
lo que se entrega está en [`01-alcance-mvp.md`](01-alcance-mvp.md) y lo que
aparezca fuera de esa lista se planifica como fase nueva.

---

## ADR-007 · Arrancar con modelos económicos y escalar con evidencia
**22-sep-2026 · Decidido por Federico**

Motores por defecto: **Flux 2 Pro** para imagen, **Runway Gen-4 Turbo** para
video, **Haiku 4.5** para texto. Se sube de motor solo cuando la tabla
`generaciones` muestre que el caro rinde más.

**Por qué:** entre la configuración económica y la premium hay 14× de diferencia
en el mismo mes de contenido. Sin medición, "escalar por prueba y error" es tirar
plata a ciegas.

---

## ADR-006 · Sin OAuth en el MVP: token de system user en variable de entorno
**22-sep-2026**

Hay un solo cliente y ya tiene token. El flujo OAuth entra en la fase 4, cuando
exista un segundo cliente.

**Consecuencia:** la tabla `cuentas_meta` ya tiene `token_ref` apuntando al
nombre de la variable. Cuando entre Vault, cambia a qué apunta el campo, no el
esquema.

---

## ADR-005 · Multi-tenant en el esquema, no en la interfaz
**22-sep-2026**

`organizacion_id` en todas las tablas desde la primera migración, aunque la
interfaz del MVP no lo muestre.

**Por qué:** agregar la columna hoy sale cero. Agregarla dentro de seis meses con
datos adentro obliga a migrar cada tabla, reescribir cada consulta y rehacer cada
política de RLS.

---

## ADR-004 · Los datos crudos de Meta se guardan íntegros en `jsonb`
**22-sep-2026**

Toda tabla de ingesta tiene una columna `crudo jsonb` con la respuesta original.

**Por qué:** Meta rota versión ~3 veces al año y cambia campos. Con el JSON
original se reprocesa sin volver a pedir, y los datos viejos ya no siempre están
disponibles. El costo es disco, que es lo más barato que hay.

**Evidencia inmediata de que era necesario:** las métricas `reach` e
`impressions` se retiraron en junio de 2026 y se reemplazaron por `views`. El
esquema ya refleja el cambio.

---

## ADR-003 · La lectura de publicidad va por el MCP oficial de Meta, no por código propio
**22-sep-2026**

Se usa `https://mcp.facebook.com/ads` (lanzado el 29-abr-2026, 29 tools, OAuth de
Business, hospedado por Meta) para todo lo de campañas publicitarias.

**Por qué:** no reescribir lo que Meta ya hospeda y mantiene.

**⚠️ Riesgo registrado:** está en beta abierta y el precio futuro no fue
anunciado. Mitigación: la capa 1 persiste todo en Postgres, así que si cambian
las condiciones el histórico ya es nuestro y solo se reemplaza la fuente de
ingesta.

---

## ADR-002 · Tres capas con compuerta de costo entre análisis y generación
**22-sep-2026**

Ingesta (sin IA) → Análisis (IA barata, cacheada) → Generación (IA cara, detrás
de confirmación humana explícita).

**Por qué:** es la única forma de que un producto con agentes tenga un costo
predecible. Ningún agente decide gastar plata: propone y cotiza, el humano
confirma.

**Regla dura:** la capa 2 nunca llama a la API de Meta. Si le falta un dato, se
arregla en la capa 1.

---

## ADR-001 · El MVP es ingesta + tablero + un solo agente
**22-sep-2026 · Pedido de Federico: "un MVP básico básico básico"**

Nada de generación, nada de publicación, un solo agente (Analista).

**Por qué:** es el único recorte que demuestra valor el primer día, no gasta en
generación, y construye el cimiento del que dependen las fases 2 a 5. Arrancar
por los creativos sería el techo antes que los cimientos.

---

## Riesgos abiertos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| R1 | No está confirmado qué permisos trae el token de Julián | 🔴 **Abierto — bloquea la fase 1** | Correr `scripts/verificar-permisos-meta.sh` |
| R2 | El MCP de Meta Ads es beta sin precio anunciado | 🟡 Vigilado | Persistir todo en Postgres |
| R3 | 27-oct-2026: los cambios que rompen de v26.0 aplican a todas las versiones | 🟡 Vigilado | Versión pineada en `META_API_VERSION` |
| R4 | No se sabe si el CRM de 999 Motos tiene API | 🟡 Abierto | No prometer la fase 5 hasta relevarlo |
| R5 | Los precios de los motores salen de comparativas, no de páginas oficiales | 🟡 Abierto | Confirmar antes de cotizar; colchón del 20% |
