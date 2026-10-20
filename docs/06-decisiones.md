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
**22-sep-2026 · Reemplazada por ADR-014**

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
| R1 | ~~Instagram no aparece en ningún permiso auditado~~ | 🟢 Resuelto 13-oct | El token del bot trae `instagram_basic` e `instagram_manage_insights` (ADR-013) |
| R7 | ~~`pages_read_engagement` figura como *Verification required* pese a tener 633 llamadas~~ | 🟢 Resuelto 14-oct | El panel de la app no muestra *Required actions* y el rate limit está en 0% |
| R8 | Tier del Marketing API en *Limited access*: 60 puntos cada 300 s | 🟢 Mitigado por diseño | Paginado corto + retroceso exponencial (ADR-010). El upgrade se gana con el uso |
| R6 | Montar la plataforma sobre la app de un CRM en producción acopla dos sistemas con ciclos de vida distintos | 🟡 Abierto | Evaluar app separada bajo el mismo Business (la verificación de negocio ya está hecha) |
| R2 | ~~El MCP de Meta Ads es beta sin precio anunciado~~ | 🟢 Ya no aplica | La ingesta va por la Graph API (ADR-014) |
| R3 | ~~27-oct-2026: los cambios que rompen de v26.0 aplican a todas las versiones~~ | 🟢 Revisado 20-oct | Ya usamos v26.0 desde julio. Ninguno de esos cambios toca los endpoints ni los parámetros de la ingesta (ver `docs/04`) |
| R4 | No se sabe si el CRM de 999 Motos tiene API | 🟡 Abierto | No prometer la fase 5 hasta relevarlo |
| R5 | Los precios de los motores salen de comparativas, no de páginas oficiales | 🟡 Abierto | Confirmar antes de cotizar; colchón del 20% |
| R9 | Si Login for Business emite tokens de usuario, vencen a los ~60 días | 🟢 Ya no aplica | La ingesta usa el token del bot, que no vence (ADR-013) |
| R10 | El system user de Login for Business no recibe `ads_read` | 🟢 Esquivado | Se usa el system user "Bot Replit" (ADR-013) |
| R11 | El token del bot puede gastar y publicar (34 permisos) | 🟡 Abierto | La regla #3 la hace cumplir el código. Antes de la fase 4, system user con permisos mínimos |
| R12 | ~~El tablero muestra datos reales del cliente y todavía no tiene login~~ | 🟢 Resuelto 14-oct | Login propio con Supabase Auth (ADR-015) |

---

## ADR-009 · El MVP corre con Standard Access: no se pide App Review
**24-sep-2026**

Auditados los permisos reales de la app `CRM 999 Motos`. Todos los activos —app,
Business, página, cuenta de IG, cuenta publicitaria— pertenecen al Business
`155769225183739`, y el token va a ser de system user de ese mismo Business.

Meta da **Standard Access automático** para datos del propio negocio; el panel lo
muestra como *"Ready for testing"*. App Review solo hace falta para **Advanced
Access**, que es acceder a datos de terceros.

**Evidencia empírica, no interpretación:** `business_management` figura como
*App Review rejected* y registra **717 llamadas exitosas**. `pages_read_engagement`,
633. `ads_read`, 141. Lo rechazado fue el Advanced; el Standard funciona.

**Consecuencia:** la fase 1 arranca sin esperar nada de Meta. El riesgo R1 baja
de rojo a amarillo — queda abierto solo por Instagram.

**Límite explícito:** esto vale **solo** mientras el producto opere sobre los
activos de Julián. Vender esto como servicio a terceros exige Advanced Access y
App Review, y a esta app ya le rechazaron un pedido antes.

---

## ADR-010 · El cron de ingesta se diseña contra el tier "Limited access"
**24-sep-2026**

El *Marketing API Access Tier* de la app está en **Limited access** (tier de
desarrollo): 60 puntos de cuota por ventana de 300 segundos, 1 punto por lectura.

**Condiciones de diseño obligatorias para la capa 1:**

- Paginar de a tandas chicas, nunca pedir todo de una.
- Retroceso exponencial ante errores de cuota (códigos 4 y 17).
- Registrar cada corrida en `sincronizaciones` para ver la tasa de error.

**Dato a favor:** para subir a Standard (9.000 puntos) hacen falta 500+ llamadas
exitosas en 15 días con menos de 15% de error. La ingesta diaria del MVP genera
ese volumen sola — el tier se sube con el uso normal, sin trámite.

Mantener la tasa de error por debajo del 15% no es prolijidad: es el requisito
del upgrade. Por eso el retroceso exponencial es parte del diseño y no un extra.

---

## ADR-011 · Token de Meta por login de Facebook, guardado en Supabase Vault
**12-oct-2026 · Decidido por Federico · Reemplaza a ADR-006**

No hay forma de conseguir un token de system user desde el Business Manager.
Lo que sí hay es acceso a *Facebook Login for Business* en la app `CRM 999
Motos`, que es como el CRM ya consume anuncios. Se adelanta el OAuth de la
fase 4.

**Cómo funciona:** `/configuracion` → *Conectar con Facebook* →
`/api/meta/login` (state en cookie httpOnly) → diálogo de Meta, donde quien se
loguea elige las cuentas → `/api/meta/callback`, que canjea el code, extiende el
token si es de usuario, verifica que vea el Business `155769225183739` y lo
guarda **cifrado en Vault** con el nombre `meta_access_token`.

**Los permisos los fija la configuración** (`META_CONFIG_ID`), no el usuario. La
pantalla muestra cuáles del MVP faltan después de cada conexión.

**Cambia la regla dura #4:** el token ya no vive solo en variables de entorno.
Va a Vault (cifrado en reposo), nunca a una tabla común. Solo `service_role`
ejecuta `guardar_token_meta` / `leer_token_meta`. `cuentas_meta.token_ref` pasa
a guardar el nombre del secreto de Vault. `META_ACCESS_TOKEN` en el entorno
queda como alternativa para scripts.

**Riesgo nuevo (R9):** si la configuración emite tokens de usuario, vencen a
los ~60 días y hay que volver a apretar el botón. Si emite tokens de system
user, no vencen. La pantalla muestra cuál de los dos tocó.

---

## ADR-012 · `business_management` sale de los permisos obligatorios del MVP
**13-oct-2026 · Decidido por Federico**

`business_management` figura como *App Review rejected* en el use case
*Create & manage ads*. Dos tokens SYSTEM_USER emitidos por Login for Business
salieron sin ese permiso, aunque estaba en la configuración y el diálogo lo
anunciaba como *"Administrar tu negocio"*. Lo confirman `debug_token`,
`granular_scopes` y `/me/permissions`.

**Decisión:** el MVP no lo exige. La ingesta no lista activos desde el Business
(`owned_ad_accounts`, `owned_pages`). Va directo a los IDs fijos de cada activo:
`META_AD_ACCOUNT_ID`, `FB_PAGE_ID`, `IG_BUSINESS_ACCOUNT_ID`, y más adelante
`cuentas_meta`.

**Costo:** no hay descubrimiento automático. Una cuenta o página nueva se agrega
a mano. Con un solo cliente piloto, el costo es casi nulo.

**Matiz a ADR-009:** el token de system user de Login for Business **no** recibió
los permisos que están solo en *Ready for testing* (`ads_read` tampoco llegó:
`(#200) Ad account owner has NOT grant ads_management or ads_read permission`).
Las llamadas que vio ADR-009 pueden haber sido con otro tipo de token. Sigue
abierto: ver R10.

**Riesgo nuevo (R10):** `ads_read` no llega en el token de system user. Sin ese
permiso no hay métricas de anuncios. Se investiga aparte; ver el informe de
`pnpm diagnostico-meta`.

---

## ADR-013 · El token de la ingesta es el del system user "Bot Replit", cargado a Vault por script
**13-oct-2026 · Decidido por Federico · Ajusta ADR-011**

El token que emite Login for Business queda a nombre de un system user que Meta
crea solo ("CRM 999 Motos System User"). Llegó sin `ads_read` dos veces, aunque se
marcaron las cuentas publicitarias en el diálogo. El token del system user
**"Bot Replit"**, generado desde el Business, sí trae `ads_read`, no vence y lee
los insights de `act_557936202401187`. Lo verificó `pnpm diagnostico-meta`.

**Corrige el diagnóstico de ADR-012:** la falta de `ads_read` no es propia de los
system users en general. Es propia del system user de integración que crea el
login.

**Cómo entra a Vault:** `pnpm guardar-token-meta` lee `META_ACCESS_TOKEN` de
`.env.local`, lo valida y lo guarda como `meta_access_token`. Se corre una vez.
La ingesta lee siempre de Vault.

**Validación común (`lib/meta/importar.ts`):** un token entra a Vault solo si es
válido, es de nuestra app, trae los permisos del MVP y ve el Business. El
callback usa la misma regla: **el botón ya no puede pisar un token bueno con uno
peor**.

**Riesgo nuevo (R11):** el token del bot tiene 34 permisos, entre ellos
`ads_management`, publicación y WhatsApp. Puede gastar y publicar. La regla dura
#3 la hace cumplir el código de la app, no el token. Antes de la fase 4, evaluar
un system user con solo los permisos necesarios.

---

## ADR-014 · La ingesta de publicidad va por la Graph API, no por el MCP
**13-oct-2026 · Decidido por Federico · Reemplaza a ADR-003**

El MCP de Meta Ads pide un login OAuth interactivo de Business. Un cron no
puede hacerlo. La Marketing API (Graph) ya está probada con el token del bot:
`act_557936202401187/insights` devuelve datos (ADR-013).

**Cómo funciona:** `GET /api/sync` (cron de Vercel, 09:00 UTC = 06:00 ART, con
`Authorization: Bearer $CRON_SECRET`) → token de Vault → `me/adaccounts` → por
cuenta, campañas e insights **diarios** de los últimos 90 días → `cuentas_meta`,
`campanias`, `metricas_campania` → registro en `sincronizaciones`. Para correrlo
a mano: `pnpm sincronizar`.

- Se guardan las campañas **activas o con datos en el período**, no los cientos
  de campañas pausadas del histórico.
- Una cuenta que falla no frena a las demás. Queda en el error de la corrida.
- Ante un corte de cuota (códigos 4, 17, 32, 613, 80000, 80004) se espera 15,
  45 y 90 segundos antes de rendirse (ADR-010).

**Qué es un "resultado":** `onsite_conversion.messaging_conversation_started_7d`
+ `lead`. En la cuenta de 999 Motos, las conversaciones aparecen en 335 de 500
filas diarias y las compras nunca. Los subtipos de lead no se suman porque `lead`
ya es su total. El JSON completo queda en `crudo` para redefinirlo sin volver a
pedir.

**Moneda:** las cuentas facturan en **ARS**. El tablero muestra la publicidad
en pesos.

**El tablero lee de Postgres**, con la función `resumen_publicidad` (la suma la
hace SQL, regla #2). Usa la clave secreta desde el servidor. La protege el
login del ADR-015.

---

## ADR-015 · Login propio con Supabase Auth, sin depender del plan de Vercel
**14-oct-2026 · Decidido por Federico**

En Hobby, Vercel no ofrece contraseña. La única protección gratis del dominio
de producción es *Vercel Authentication*, y con ella solo entran usuarios de
Vercel. Federico quiere que entren otras personas sin depender de algo externo.
Es el punto 1 del alcance del MVP.

**Cómo funciona:**

- `proxy.ts` (el `middleware` de Next 16) llama a `lib/auth/acceso.ts` en cada
  pedido. Sin sesión, las páginas van a `/login?volver=…` y las APIs responden 401.
- La sesión son dos cookies httpOnly, Secure y SameSite=Lax: `sesion_acceso`
  (≈1 h) y `sesion_renovar` (30 días). Si el access vence, el proxy lo renueva
  solo.
- El token se valida contra Supabase (`/auth/v1/user`) en cada pedido. No se
  decodifica localmente, así que una sesión revocada se corta enseguida.
- **Falla cerrado:** si Supabase Auth no responde o falta configuración, 503.
  Nunca deja pasar por error.
- **Entra solo quien sea miembro** de la organización piloto (tabla `miembros`).
  Se revisa en el login, con la clave secreta.
- **Rutas públicas:** `/login`, `POST /api/auth/login` y `/api/sync` (que tiene
  su propio `CRON_SECRET`).
- `destinoSeguro` evita el open redirect en `volver` (`//malo.com`, `/\malo.com`).

**Altas:** `pnpm alta-usuario <email> [director|operador|lector]` crea el usuario
confirmado con una clave aleatoria y lo hace miembro. No hay registro abierto.

**Sin SDK:** Supabase Auth por REST con fetch inyectado, igual que el resto de
`lib/`. Cero dependencias nuevas.

**Costo:** una llamada a Supabase Auth por pedido (~50-150 ms). Con un solo
cliente no importa. Si molesta, se valida el JWT localmente con JWKS.
