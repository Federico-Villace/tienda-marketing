# 06 · Bitácora de decisiones

Una entrada por decisión que costaría plata revertir. Orden cronológico inverso.

---

## ADR-019 · El botón "Actualizar estadísticas" dispara la sincronización en el servidor, con límite de 15 minutos
**23-oct-2026 · Decidido por Federico**

Julián pidió poder actualizar las estadísticas sin esperar al cron de las 9:00,
sin gastar de más la cuota de la Graph API (ADR-010).

**Cómo funciona:** el tablero tiene el botón *Actualizar estadísticas* (solo
director y operador). Hace `POST /api/actualizar`, que exige sesión (no es una
ruta pública) y corre en el servidor, en serie, las **mismas** funciones que los
crons: `sincronizarPublicidad` y después `sincronizarOrganico`, con el token de
Vault. Devuelve el estado, las filas y un resumen por tipo; nunca un token.

**Decisiones:**

- **Respeta la regla #5.** El navegador no escribe en la base: solo pide. La
  escritura la hace el backend con la clave secreta, igual que el cron.
- **Límite sin tabla nueva**, leyendo `sincronizaciones`:
  - hay una corrida `corriendo` de menos de 10 min → **409** "Ya hay una
    actualización en curso";
  - la última corrida (de publicidad u orgánico, del cron o del botón) arrancó
    hace menos de 15 min → **429** "Probá de nuevo en N minutos" + `Retry-After`.
  - Una `corriendo` de más de 10 min se da por muerta (la función se cortó sin
    cerrarla): no bloquea para siempre. Las constantes viven en `lib/ingesta/actualizar.ts`.
- **Estado `parcial`** (migración `20261023120000_sync_parcial.sql`): si algunas
  cuentas cargaron y otras no, la corrida queda `parcial` (con el error saneado
  de las que fallaron) en vez de `error`. `error` queda para cuando no cargó
  ninguna o falló algo global. El cron responde 200 en `parcial`, 502 en `error`.
- **Carrera residual:** dos pedidos en el mismo instante pueden pasar el chequeo
  antes de que alguno inserte su fila `corriendo`. Es una ventana de milisegundos
  para un solo cliente; si molestara, se cierra con un RPC que chequee e inserte
  en una sola transacción.
- **Costo:** cero. No hay IA ni dólares; la única "plata" es cuota de Meta.

**Alternativas descartadas:** un cron más frecuente (gasta cuota todo el día aunque
nadie mire) y escribir desde el navegador con la clave publicable (viola la regla #5).

---

## ADR-018 · El Estratega: plan de campaña versionado, aprobable y solo texto
**22-oct-2026 · Decidido por Federico**

Abre la fase 2. Julián pidió el plan de campaña como **propuesta con OK / Editar**
y poder **editar instancias anteriores**. El Estratega lee un análisis ya guardado
más un brief y devuelve un plan estructurado que una persona aprueba o corrige.
El Contenidista (próximo cambio) lo va a consumir por id.

**Decisión:**

- **Entrada = texto + brief, nunca filas ni agregados** (regla #2, y la capa 2 no
  sale a Meta). Al modelo le llegan el texto del análisis elegido (de los últimos
  5) y el brief (objetivo, marcas, producto, tope de presupuesto en ARS, ventana,
  notas que corrigen al análisis). Sin ids. Lo demuestra un test sobre el body real.
- **Salida estructurada:** structured outputs `json_schema` con `strict: true` y un
  validador propio (`validarPlan`), el mismo para el LLM y para las ediciones
  humanas. No se confía en strict: rangos, suma de canales = 100, ventana dentro
  del brief y semanas del calendario se controlan en el código. Si OpenAI rechaza
  el schema con un 400 reconocible, se reintenta **una vez** con `json_object` y
  el schema pegado en las instrucciones; el formato vive aislado en
  `lib/estratega/esquema.ts` (`FORMATO_ESTRATEGA`).
- **Versiones inmutables:** editar inserta una fila nueva (`raiz_id`, `padre_id`,
  `version + 1`, `origen = edicion`, costo US$ 0). Estados: `borrador`,
  `aprobado`, `descartado`, `reemplazado`. Un aprobado sigue vigente hasta que se
  aprueba el nuevo; nunca hay más de un aprobado por raíz (índice único parcial).
- **Transiciones en Postgres:** `editar_plan`, `aprobar_plan` y `descartar_plan`
  (plpgsql, `for update` sobre la raíz, `set search_path = ''`). PostgREST no
  ofrece transacciones de varias sentencias y sin esto habría carreras ("aprobar
  dos veces", "editar una versión vieja"). Una versión que ya no es la vigente
  responde `errcode 'PT409'`, que PostgREST traduce a HTTP 409. Solo `service_role`
  puede ejecutarlas (`revoke` a `public`, `anon` y `authenticated`).
- **Caché por hash** (organización + análisis + brief + `VERSION_PROMPT` + modelo)
  solo para los planes del agente: mismo pedido = mismo plan, sin cobrar. Un hit
  sobre un plan descartado devuelve el descartado; para uno nuevo se cambian las
  notas del brief.
- **Todo es propuesta:** el presupuesto (ARS, nivel campaña / conjunto / a definir
  — pregunta abierta de Julián), la ventana y los públicos **no se ejecutan en
  Meta**. Los públicos son descripción y segmentos en texto: se rechazan emails,
  teléfonos y listas. Subir Custom Audiences exigiría `ads_management` y datos
  personales; queda fuera. La pantalla lo dice explícitamente.
- **Permisos:** igual que el Analista. `director` y `operador` generan y actúan;
  `lector` recibe 403; sin sesión, 401. Aprobar, descartar y editar no llaman a
  OpenAI ni cuestan.
- **Código compartido:** el cliente de OpenAI, los precios, la autorización y el
  hash se extrajeron a `lib/agentes/` (`pedirRespuesta` acepta un `formato`
  opcional). El Analista solo cambió imports y su suite quedó intacta.
- **Modelo:** `MODELO_ESTRATEGA` (opcional, por defecto `gpt-6-luna`). Un modelo
  sin precio da error antes de llamar.

**Consecuencias:** un plan cuesta del orden de US$ 0,002. Si strict no acepta el
schema con el modelo elegido, el respaldo `json_object` lo cubre sin cambios de
código. Queda fuera "regenerar con indicaciones" y editar el análisis; las notas
del brief cumplen esa función. Migración `20261022120000_estratega.sql`.

---

## ADR-017 · El Analista usa OpenAI (gpt-6-luna) y cachea por hash del payload
**20-oct-2026 · Decidido por Federico**

Cierra los criterios 4 y 5 del MVP (análisis escrito con su costo en pantalla) y
el pedido de Julián de filtrar por fechas y por plataforma. Reemplaza el modelo
de texto de ADR-007 (Haiku 4.5): el Analista pasa a **OpenAI**.

**Decisión:**

- **Responses API por `fetch`**, sin SDK, con `gpt-6-luna` por defecto
  (`MODELO_ANALISTA` lo cambia), `reasoning: low`, `store: false` y
  `max_output_tokens: 6000`. Timeout de 90 s.
- **Caché explícito sin breakpoints** (`prompt_cache_options`): evita el recargo
  de 1,25× por escritura de caché. Vive en una sola constante en
  `lib/analista/openai.ts`; si OpenAI lo rechazara, se borra esa constante.
- **Precios tipados con fuente y fecha** (`lib/analista/precios.ts`,
  developers.openai.com/api/docs/pricing, verificado el 20-oct-2026). Un modelo
  que no figura en la tabla da error **antes** de llamar a OpenAI: nunca un costo de 0.
- **Llave del caché = hash del payload** (organización + tipo + agregados +
  `VERSION_PROMPT` + modelo), en `analisis.hash_entrada` con
  `unique (organizacion_id, hash_entrada)`. Reemplaza la receta de `docs/02`
  (rango + última sync): mismos datos implican el mismo análisis, y una sync que
  no cambió nada no vuelve a cobrar. Subir `VERSION_PROMPT` invalida el caché.
- **Regla #2:** las filas viajan de Postgres al servidor; al modelo solo le llega
  un JSON de agregados (< 12.000 caracteres, sin ids, permalinks ni `crudo`). Lo
  demuestra un test sobre el body real que sale a OpenAI.
- **Identidad por header:** `proxy.ts` inyecta `x-usuario-id` con el usuario ya
  verificado y **siempre borra** el que mande el cliente. El endpoint no vuelve a
  verificar la cookie: si el access token venció, el proxy ya renovó y renovar
  de nuevo rotaría el refresh token.
- **Permisos:** `director` y `operador` pueden analizar; `lector` recibe 403.
  El rol se lee de `miembros` con la clave secreta.
- **Filtros:** `?desde&hasta&plataforma&marca`, validados en el servidor y
  recortados a la ventana de 90 días. Lo orgánico filtra por marca, plataforma
  y fechas; la publicidad **solo por fechas** (las campañas no están mapeadas a
  marca). La UI lo aclara.
- **Migración `20261021120000`:** `p_hasta` (default `null`) en
  `resumen_publicaciones` y `resumen_publicidad`; se dropean las firmas de 2
  argumentos porque con ambos overloads la llamada sería ambigua. `analisis`
  suma `filtros`, `creado_por`, `tokens_cacheados` y `tokens_razonamiento`.
- **Día de la semana en hora argentina** (UTC-3) en los agregados: un post de
  las 21:30 del domingo ya no cae en lunes.

**Consecuencias:** si OpenAI cambia un precio hay que editar `precios.ts`. Un
análisis cuesta del orden de US$ 0,001 a 0,0015. Bajar los agregados a SQL queda
para más adelante. Cierra R5 para el texto (los motores de imagen y video siguen
abiertos).

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
video, **Haiku 4.5** para texto (*reemplazado por OpenAI en ADR-017*). Se sube de motor solo cuando la tabla
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
| R5 | Los precios de los motores salen de comparativas, no de páginas oficiales | 🟡 Abierto para imagen y video · 🟢 Cerrado para texto (20-oct) | El texto usa la página oficial de OpenAI (ADR-017). Imagen y video: confirmar antes de cotizar; colchón del 20% |
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

---

## ADR-016 · La ingesta orgánica usa page tokens efímeros e insights anidados
**20-oct-2026 · Decidido por Federico**

Cierra la fase 3: publicaciones de IG y FB de las 7 marcas, con métricas reales,
en Postgres. El tablero deja de usar `publicacionesDeMuestra()`.

**Qué mostró el sondeo (v26.0, token del bot):**

- `{ig}/media` con el token del bot y `insights.metric(views,reach,likes,comments,shares,saved)`
  anidado funciona. `impressions` da error 100.
- `{page}/posts` con el token del bot da error **190/2069032**. Hace falta el
  *page token* que devuelve `me/accounts`.
- Métricas válidas de FB: `post_media_view`, `post_reactions_by_type_total`,
  `post_clicks`, `post_video_views`. **Inválidas en v26:** `post_impressions`,
  `post_impressions_unique`, `post_engaged_users`.

**Cómo funciona:** `GET /api/sync-organico` (cron `15 9 * * *`, 15 minutos después
del de publicidad, para no competir por la cuota) → token de Vault → `me/accounts`
→ 14 cuentas en `cuentas_meta` (una facebook y una instagram por página) → por
cuenta, media o posts de los últimos 90 días → `publicaciones` y
`metricas_publicacion` → registro en `sincronizaciones` (tipo `publicaciones`).
A mano: `pnpm sincronizar-organico`.

**Decisiones:**

- **Page token efímero.** Sale de `me/accounts`, vive solo en memoria y se usa
  únicamente para `/posts` de FB. No se guarda en tabla, `crudo`, `sincronizaciones`
  ni logs (regla #4). Todo error pasa por `textoSeguro`, y todo `crudo` por
  `sinPaginado`, porque los `paging.next` anidados traen `access_token=` en la URL.
- **Insights anidados:** una llamada por cuenta, sin N+1.
- **Una foto de métricas por post y día** (fecha argentina). La migración
  `20261020120000` agrega `fecha` y `unique (publicacion_id, fecha)`: PostgREST
  no acepta expresiones en `on_conflict`, y así re-correr el mismo día no duplica.
- **`resumen_publicaciones`** (la última foto de cada post, con `lateral`) es
  `stable` y solo la ejecuta `service_role`. La lectura es de Postgres, nunca de Meta.
- **`publicaciones.tipo` normalizado** (`reel`, `carrusel`, `imagen`, `video`);
  el valor original de Meta queda en `crudo`.
- Las marcas siguen estáticas (`lib/datos/marcas.ts`, ahora con `igId`). Fase 4:
  salen de la base.

**Consecuencias:** R11 sigue abierto: toda la ingesta es GET, pero el token del
bot conserva permisos de escritura. Las métricas inválidas en v26 quedan anotadas
en `docs/04`. Si un solo media no soporta una métrica anidada, falla el listado
de esa cuenta (error #100): queda como error de la cuenta y el fallback sería
pedir sin insights y hacer el N+1.

**Corrección 20-oct:** el sondeo real mostró que el supuesto anterior era falso:
Meta no falla, **omite en silencio** los media que no puede medir (Zontes IG: 17
sin insights anidados, 16 con ellos; faltaba un `IMAGE`/`FEED` del 26-ago). Las
publicaciones desaparecían sin error. Ahora se lista sin insights (autoritativo) y
con insights, se cruza por id y solo los omitidos se piden uno por uno; si Meta
responde #100 se guardan con métricas en `null`. Igual para los posts de FB. El
resumen por cuenta informa `recuperadas` y `sinMetricas`. Detalle en `docs/04`.

