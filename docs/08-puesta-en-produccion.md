# 08 · Puesta en producción: lista para probar

> Pendiente al 14-oct-2026. Cubre la ingesta de publicidad (ADR-014), el login
> (ADR-015) y, desde el 20-oct, el Analista (ADR-017, sección 8). Las altas de usuarios son **internas**: no hay registro abierto.

## Ya hecho

- [x] Migración `20261013120000` aplicada: organización *999 Motos* y `resumen_publicidad`.
- [x] Token del bot en Vault (`pnpm guardar-token-meta`) y verificado (`pnpm diagnostico-meta`).
- [x] Primera carga (`pnpm sincronizar`): 123 campañas, ARS 4.912.968, 3.192 resultados.

## 1 · Supabase

- [ ] **Authentication → Sign In / Providers → desactivar "Allow new users to sign up".**
  Nadie se registra solo: las altas se hacen con `pnpm alta-usuario`.

## 2 · Vercel

- [ ] **Settings → Environment Variables:** que estén cargadas
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, que usa el login
  - `SUPABASE_SECRET_KEY`
  - `META_API_VERSION`
  - `CRON_SECRET`, un valor largo y aleatorio
- [ ] **Settings → Deployment Protection:** desactivado. El login propio lo
  reemplaza, y con la protección prendida el cliente no podría entrar.

## 3 · Tu usuario

- [ ] `pnpm alta-usuario tu@email.com director`
  - ⚠️ Imprime la clave inicial **una sola vez**. Correlo en tu terminal, no
    dentro del chat con `!`.

## 4 · Deploy

- [ ] `git push`

## 5 · Probar el login

- [ ] Ventana de incógnito → `/tablero` → te manda a `/login`.
- [ ] Entrás con tu email y tu clave → volvés a `/tablero`.
- [ ] Clave equivocada → "Email o contraseña incorrectos".
- [ ] **Salir** → abrís `/tablero` de nuevo → te pide el login otra vez.

## 6 · Probar la publicidad

- [ ] `/tablero` → **Publicidad**: alrededor de ARS 4,9 M, 123 campañas y 3.192
  resultados, con "Datos reales de Meta · actualizado …".
- [ ] **Settings → Cron Jobs:** aparece `/api/sync` con `0 9 * * *` (06:00 ART).
- [ ] Sync manual en producción:
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/sync
  ```
  Tiene que devolver `"estado":"ok"`. Sin el header, **401**.
- [ ] Al día siguiente, después de las 06:00: **Cron Jobs → View Logs**, la
  corrida en **200**.

## 7 · Probar las publicaciones orgánicas (ADR-016)

No hay variables de entorno nuevas.

- [ ] **Supabase → SQL Editor:** aplicar
  `supabase/migrations/20261020120000_metricas_diarias_y_resumen_publicaciones.sql`.
- [ ] **Supabase → SQL Editor:** aplicar
  `supabase/migrations/20261020180000_clics_en_metricas_y_resumen_publicaciones.sql`
  (agrega `clics` a `metricas_publicacion` y hace que `resumen_publicaciones`
  también lo devuelva). Va **antes** del `git push`: el código nuevo escribe
  `clics` y el tablero lo lee; sin la migración la sincronización falla.
- [ ] `git push` (sube el endpoint, el cron y el tablero nuevo).
- [ ] Primera carga, desde tu máquina: `pnpm sincronizar-organico`. Tiene que
  terminar en `ok`, con 14 cuentas (7 facebook, 7 instagram), cada una con sus
  publicaciones y métricas.
- [ ] `/tablero` → cada marca muestra sus publicaciones reales de los últimos 90
  días, sin el aviso de "datos de muestra".
- [ ] **Settings → Cron Jobs:** aparece `/api/sync-organico` con `15 9 * * *`
  (06:15 ART).
- [ ] Sync manual en producción (opcional):
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/sync-organico
  ```
  Sin el header, **401**.

## 8 · Probar el Analista (ADR-017)

Variable de entorno: `OPENAI_API_KEY` (ya cargada en Vercel). `MODELO_ANALISTA`
es opcional: vacía usa `gpt-6-luna`. Si todavía existe `ANTHROPIC_API_KEY`
en Vercel, se puede borrar: ya nada la usa.

- [ ] **Supabase:** aplicar la migración `supabase/migrations/20261021120000_analista.sql`
  con `supabase db push` (o pegándola en el SQL Editor). Va **antes** del
  `git push`: el código nuevo llama a las funciones con `p_hasta` y escribe
  columnas nuevas de `analisis`; sin la migración el tablero falla.
- [ ] `git push` (sube el endpoint `/api/analisis`, los filtros y el botón).
- [ ] Entrar a `/tablero` como director u operador, elegir una marca, la
  plataforma y un rango de fechas, y apretar **Aplicar**. El tablero y la
  publicidad tienen que cambiar según las fechas.
- [ ] Apretar **Analizar período**. En menos de 60 segundos aparece el texto del
  análisis, el modelo y el costo con la forma **"US$ 0,00xx"**.
- [ ] Verificar en Supabase (Table Editor → `analisis`) que hay una fila nueva con
  `costo_usd`, `modelo`, `filtros` y `creado_por`.
- [ ] Apretar **Analizar período** de nuevo **con los mismos filtros**: aparece
  "desde caché · sin costo extra" y no se crea otra fila en `analisis` ni se gasta
  nada en OpenAI.
- [ ] Cambiar las fechas o la plataforma y volver a analizar: es un análisis nuevo,
  con costo nuevo.
- [ ] Entrar con un usuario **lector** (`pnpm alta-usuario ... lector`) y probar
  el análisis: responde **403** ("Tu rol no permite pedir análisis"). Sin sesión,
  `POST /api/analisis` responde **401**.
- [ ] Con un rango sin publicaciones ni campañas el botón responde un aviso
  (422) y no se llama a OpenAI.

## 9 · Dar acceso a otra persona

- [ ] `pnpm alta-usuario julian@... director` (o `operador` / `lector`).
- [ ] Pasale la clave por un canal privado.

## 10 · Probar el Estratega (ADR-018)

Variables de entorno: ninguna obligatoria nueva. `OPENAI_API_KEY` ya existe;
`MODELO_ESTRATEGA` es opcional (vacía usa `gpt-6-luna`).

- [ ] **Supabase:** aplicar la migración `supabase/migrations/20261022120000_estratega.sql`
  con `supabase db push` (o pegándola en el SQL Editor). Va **antes** del
  `git push`: la pantalla `/campanas` lee la tabla `planes`; sin la migración falla.
  Verificar que no dé error en la clave foránea de `planes.raiz_id` (apunta a la
  misma tabla; el trigger `planes_raiz` la completa al insertar).
- [ ] `git push` (sube `/api/planes`, `/api/planes/[id]` y la pantalla real).
- [ ] Entrar a `/campanas` como director u operador. Armar un brief: elegir uno de
  los últimos análisis, un objetivo, al menos una marca, un presupuesto tope en
  ARS y las fechas. Apretar **Generar plan**.
- [ ] En menos de 60 segundos aparece el plan (objetivo, público, canales,
  calendario, KPIs, fundamentos) con el costo con la forma **"US$ 0,00xx"**.
  Verificar la nota: **no se ejecuta nada en Meta** y los públicos son
  recomendaciones.
- [ ] Verificar en Supabase (Table Editor → `planes`) que hay una fila con
  `version = 1`, `origen = agente`, `estado = borrador`, `costo_usd` y `creado_por`.
- [ ] Generar **el mismo brief otra vez**: se reutiliza el plan ("desde caché ·
  sin costo extra") y no se crea otra fila ni se gasta en OpenAI.
- [ ] Apretar **Editar**, cambiar algo y **Guardar como versión 2**: aparece la v2
  con **US$ 0,0000**, la v1 queda como *reemplazado* en el historial.
- [ ] Apretar **OK**: la v2 pasa a *aprobado*. Editar el aprobado crea un borrador
  v3 y la v2 sigue aprobada hasta que se apruebe la v3.
- [ ] Probar con dos pestañas abiertas sobre la misma versión: la segunda acción
  muestra el aviso "Este plan cambió" (409) y se recarga.
- [ ] Entrar con un usuario **lector**: ve los planes sin botones ni formulario.
  `PATCH /api/planes/[id]` y `POST /api/planes` responden **403**; sin sesión, **401**.

## 11 · Probar el botón "Actualizar estadísticas" (ADR-019)

Variables de entorno: ninguna nueva.

- [ ] **Supabase:** aplicar la migración `supabase/migrations/20261023120000_sync_parcial.sql`
  con `supabase db push` (o pegándola en el SQL Editor). Va **antes** del
  `git push`: agrega el valor `parcial` al enum `estado_sync`; sin la migración,
  una corrida con cuentas fallidas no podría cerrarse.
- [ ] `git push` (sube `/api/actualizar` y el botón).
- [ ] Entrar a `/tablero` como director u operador y apretar **Actualizar
  estadísticas**. Mientras corre, el botón queda deshabilitado ("Actualizando…").
  Puede tardar varios minutos.
- [ ] Al terminar, la pantalla se refresca y muestra un resumen de publicidad y de
  publicaciones. En Supabase (`sincronizaciones`) hay dos filas nuevas
  (`campanias` y `publicaciones`).
- [ ] **Probar el límite:** apretar el botón **una segunda vez enseguida**. Tiene
  que responder **429** con "Probá de nuevo en N minutos" (N cerca de 15) y no
  crear filas nuevas en `sincronizaciones`.
- [ ] Si alguna cuenta falla pero otras cargan, la corrida queda en `parcial` y el
  tablero lo avisa con el detalle; en `error` solo si no cargó ninguna.
- [ ] Entrar con un usuario **lector**: no hay botón, solo el aviso de solo
  lectura. `POST /api/actualizar` responde **403**; sin sesión, **401**.

## 12 · Probar los mensajes recibidos (ADR-020)

Variables de entorno: ninguna nueva. Permisos de Meta: `pages_messaging` e
`instagram_manage_messages` (solo se leen metadatos; el sondeo del 20-oct ya anduvo
con el token actual).

- [ ] **Supabase:** aplicar `supabase/migrations/20261024120000_metricas_cuenta.sql`
  con `supabase db push` (o pegándola en el SQL Editor). Va **antes** del
  `git push`: sin la tabla `metricas_cuenta` y la función `resumen_mensajes`, el
  tablero muestra el aviso de error en la tarjeta y la ingesta marca la corrida como `parcial`.
- [ ] `git push` (sube la ingesta y la tarjeta).
- [ ] Correr `pnpm sincronizar-organico` (o el botón *Actualizar estadísticas*).
  Tiene que terminar `ok`. Si queda `parcial` con `mensajes:` en el detalle, falta
  un permiso o hubo un error de Meta: los posts se guardaron igual.
- [ ] En Supabase, `metricas_cuenta` tiene 90 filas por cuenta (facebook e
  instagram de cada página). Revisar que el `crudo` solo tenga números, sin ids ni nombres.
- [ ] En `/tablero`, marca **Zontes Quilmes**, últimos 30 días: la tarjeta
  *Mensajes recibidos* tiene que dar ≈ **Instagram 83** conversaciones activas y
  **Messenger 4** (valores del sondeo del 20-oct; se mueven un poco con los días).
- [ ] Cambiar el filtro de plataforma y de fechas: la tarjeta sigue a los filtros.
- [ ] Verificar el corrimiento horario de *conversaciones nuevas* (Meta corta los
  días en hora del Pacífico): comparar un día puntual contra Meta Business Suite.

## 13 · Probar el Contenidista (ADR-021)

Variables de entorno: ninguna obligatoria nueva. `OPENAI_API_KEY` ya existe;
`MODELO_CONTENIDISTA` es opcional (vacía usa `gpt-6-luna`).

- [ ] **Supabase:** aplicar la migración `supabase/migrations/20261025120000_contenidista.sql`
  con `supabase db push` (o pegándola en el SQL Editor). Va **antes** del
  `git push`: `/contenido` lee las tablas `tandas_contenido` y `piezas`; sin la
  migración falla. Verificar que no dé error: la función `guardar_tanda` es la
  única pieza de SQL nueva que nunca corrió en un Postgres real.
- [ ] `git push` (sube `/api/contenido`, `/api/piezas/[id]` y la pantalla real).
- [ ] Entrar a `/contenido` como director u operador. Elegir el plan aprobado
  (si no hay, aprobar uno en `/campanas`) y apretar **Generar semana 1**
  (el botón dice "~US$0,002"). En menos de 60 segundos aparecen las piezas y el
  **costo real** ("Costo real: US$ 0,00xx"). Verificar el aviso: **no se publica
  nada; las imágenes y videos son fase 3.**
- [ ] En Supabase: `tandas_contenido` tiene una fila (con `costo_usd` y
  `hash_entrada`) y `piezas` tiene una fila por pieza con `version = 1`,
  `origen = agente`, `estado = borrador`.
- [ ] Apretar **Editar** en una pieza, cambiar el copy y **Guardar como versión 2**:
  aparece la v2 sin costo (en Supabase, `origen = edicion`) y la v1 queda como
  *reemplazada* en "Versiones". Mirar los contadores de caracteres (copy/2200).
- [ ] Apretar **OK** en una pieza: pasa a *aprobada*. Apretar **Descartar** en otra.
- [ ] Repetir **la misma semana con las mismas notas**: el botón dice "desde caché"
  y la respuesta no crea otra tanda ni gasta en OpenAI.
- [ ] Escribir otras notas y generar de nuevo: aparece una tanda nueva y la anterior
  queda en "Tandas anteriores".
- [ ] Revisar si alguna pieza dice **"precio a completar"**: es un `[precio]` que el
  modelo no pudo respaldar con el plan ni las notas. Editala y escribí el precio real.
  Ningún monto, cuota ni porcentaje debería salir si no estaba en el plan o las notas.
- [ ] Probar con dos pestañas sobre la misma pieza: la segunda acción muestra "otra
  persona cambió esta pieza" (409) y se recarga.
- [ ] Aprobar una versión nueva del plan en `/campanas` y volver a `/contenido`: las
  tandas del plan viejo muestran el badge **"plan desactualizado"**.
- [ ] Entrar con un usuario **lector**: ve las piezas sin botones ni generador.
  `POST /api/contenido` y `PATCH /api/piezas/[id]` responden **403**; sin sesión, **401**.

## Antes de la demo

- [ ] Confirmar con Julián que "resultado" = conversación de mensajes iniciada o
  lead (ADR-014).
- [ ] Publicaciones de IG y FB: ya son reales (sección 7).

## Para más adelante

- Cambiar o recuperar la clave desde la app. Hoy se resetea desde Supabase.
- Pantalla de administración de usuarios, en lugar del script.
