# 02 · Arquitectura

## El principio que ordena todo: separar leer de pensar, y pensar de generar

El error clásico en un producto así es tener un solo agente que hace todo. Cada
vez que el usuario pregunta algo, el agente sale a la API de Meta, trae datos
crudos, los mete en el contexto, razona, y de paso genera un video "por las
dudas". Resultado: lento, caro e impredecible.

Acá va separado en tres capas, y entre la segunda y la tercera hay una
**compuerta que solo abre un humano**.

```
┌── CAPA 1 · INGESTA ───────────────────────── costo: ~0 ────────────┐
│  Cron diario → MCP de Meta Ads + Graph API → Postgres              │
│  CERO modelos de IA. Es un ETL, nada más.                          │
│  Nunca se dispara desde una acción del usuario.                    │
└────────────────────────────────────────────────────────────────────┘
                              ↓  lee de Postgres, NUNCA de la API
┌── CAPA 2 · ANÁLISIS ─────────────────── costo: centavos ───────────┐
│  LLM sobre AGREGADOS, nunca sobre filas crudas.                    │
│  Cacheado por hash de (organización, rango, versión del prompt).   │
│  Misma pregunta dos veces = una sola llamada facturada.            │
└────────────────────────────────────────────────────────────────────┘
                              ↓  ⛔ COMPUERTA DE COSTO
┌── CAPA 3 · GENERACIÓN ───────────────── costo: dólares ────────────┐
│  Presupuesto ANTES de ejecutar, en pantalla, en dólares.           │
│  Nada se genera sin un click explícito.                            │
│  Cada job escribe su costo real en la tabla `generaciones`.        │
└────────────────────────────────────────────────────────────────────┘
```

### Las tres reglas que hacen que esto funcione

**Regla 1 — La capa 2 jamás llama a la API de Meta.**
Si el Analista necesita un dato que no está en Postgres, la respuesta no es
"salgo a buscarlo": es "falta en la ingesta". Se arregla en la capa 1. Esto
mantiene el análisis rápido, reproducible y sin depender de los límites de tasa
de Meta.

**Regla 2 — La capa 2 ve agregados, no filas.**
No se le mandan 400 publicaciones al modelo. Se le manda un resumen calculado en
SQL: promedios por tipo de contenido, por día de la semana, por horario, los 10
mejores y los 10 peores. Postgres hace la aritmética gratis; el LLM solo
interpreta. Esto baja el gasto de tokens un orden de magnitud y además mejora la
calidad del análisis, porque el modelo no se pierde en el ruido.

**Regla 3 — La capa 3 no arranca sola, nunca.**
Ningún agente decide gastar plata. El agente propone y cotiza; el humano
confirma. Sin excepciones, ni siquiera "para probar".

## Por qué el caché de análisis no es opcional

Un análisis de un período que ya pasó **no cambia nunca**. Los datos de agosto
en septiembre son los mismos que en octubre. Si Julián abre el tablero cinco
veces, pagar cinco veces el mismo análisis es tirar plata.

El caché se llavea con un hash de: organización + rango de fechas + versión del
prompt + última sincronización. Si cambia cualquiera de los cuatro, se recalcula.
Si no, se sirve de la tabla `analisis`.

## Los cuatro agentes

Solo el último toca la billetera.

| Agente | Fase | Lee de | Gasta | Entrega |
|---|---|---|---|---|
| **Analista** | 1 (MVP) | Agregados SQL | centavos | Qué funcionó, qué no, cuándo conviene publicar |
| **Estratega** | 2 | Salida del Analista | centavos | Objetivo, mensaje central, canales, calendario |
| **Contenidista** | 2 | Plan + perfil de marca | centavos | Copys, guiones, hooks, hashtags |
| **Productor** | 3 | Guiones + imagen subida | **dólares** | Prompts, presupuesto, y recién ahí los creativos |

Los tres primeros son texto puro. El 100% del riesgo económico del producto vive
en un solo agente, y ese agente está detrás de la compuerta.

## Flujo de datos del MVP

```
Cron de Vercel (diario, 06:00 ART)
   │
   ├─→ Graph API ─────→ publicaciones + metricas_publicacion
   └─→ MCP Meta Ads ──→ campanias + metricas_campania
              │
              └─→ registro en `sincronizaciones` (éxito, filas, error)

Usuario abre el tablero
   │
   ├─→ Consultas SQL de agregados          (instantáneo, gratis)
   └─→ Botón "Analizar período"
          │
          ├─ ¿hay caché válido? ──sí──→ se sirve de `analisis`       (gratis)
          └─ no ─→ LLM sobre agregados ─→ se guarda en `analisis`
                                          con tokens y costo en USD
```

## Dónde viven los secretos

En el MVP **no se guarda ningún token en la base de datos**. El token de system
user de Meta vive como variable de entorno en Vercel, y el código lo lee del
servidor. La tabla `cuentas_meta` guarda un `token_ref` — el *nombre* de la
variable, no su valor.

Cuando el producto pase a multi-tenant (fase 4) y cada organización tenga su
propio token, recién ahí se usa Supabase Vault con cifrado en reposo. Meter esa
complejidad ahora, con un solo cliente, es sobreingeniería.

## Decisiones que se tomaron a propósito

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Ingesta por cron, no a demanda | Traer de Meta cuando el usuario mira | Los límites de tasa de Meta son por hora; un usuario impaciente rompe la app |
| Columna `crudo jsonb` en cada tabla de ingesta | Solo columnas tipadas | Meta cambia su esquema seguido; guardar el JSON original permite reprocesar sin volver a pedir |
| Agregados en SQL, no en el LLM | Mandarle las filas al modelo | Postgres suma gratis y sin alucinar |
| Sin OAuth en el MVP | Flujo OAuth completo desde el día 1 | Hay un solo cliente y ya tiene token. OAuth entra cuando haya un segundo. |
| Multi-tenant en el **esquema**, no en la **UI** | Una sola tabla sin `organizacion_id` | Agregar la columna después obliga a migrar todo. Tenerla desde el día 1 sale gratis. |
