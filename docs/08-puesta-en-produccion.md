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
  Tarda ~2–3 minutos (ADR-025).
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

## 14 · Probar el Productor (ADR-022)

Este es el primer paso que **gasta dólares** (centavos por imagen). Seguí el orden.

Variables de entorno (solo los nombres; los valores los cargás vos):

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Clave de la Gemini API (Google AI Studio). Ya la tenés cargada |
| `PRESUPUESTO_MENSUAL_USD` | Sí | Tope mensual en US$. **Sin ella el Productor está apagado.** Para la prueba: `10` |
| `MODELO_IMAGEN` | No | Vacía usa `gemini-nano-banana-2.1` |

- [ ] **Supabase:** aplicar la migración
  `supabase/migrations/20261026120000_productor.sql` con `supabase db push` (o
  pegándola en el SQL Editor). Va **antes** del `git push`: `/creativos` llama a
  `gasto_generaciones_mes` y lee `creativos`; sin la migración la pantalla falla.
  Verificar que no dé error.
- [ ] **Supabase → Storage:** confirmar que existe el bucket **`creativos`** y que
  figura como **privado** (no "Public"). Lo crea la migración; si no está, la
  migración no corrió completa.
- [ ] **Variables:** cargar `PRESUPUESTO_MENSUAL_USD=10` en Vercel (**Production y
  Preview**) y en `.env.local`. Después **redeploy** (las variables nuevas no
  llegan a un deploy ya hecho).
- [ ] `git push` (sube `/api/generaciones`, `/api/generaciones/[id]/confirmar`,
  `/api/creativos/[id]` y la pantalla real).
- [ ] Entrar a `/creativos` como **director u operador**. Debe verse el aviso de
  que "la IA puede inventar detalles de la moto" y **no** el viejo "confirmar no
  dispara ningún job". Arriba, en la tarjeta "Crear imagen": "US$ 0,0000 de US$ 10,0000 este mes".
- [ ] Paso 1: elegir **"Un texto ya aprobado"** y una pieza de formato imagen,
  carrusel o historia (si no hay, aprobar una en `/contenido`). Motor **Nano Banana
  2.1**, variantes **2**, **Ver precio**. Debe mostrar el total (el tope, ~US$ 0,0867) y el botón
  **"Confirmar US$ 0,0867"**. En Supabase, `generaciones` tiene una fila
  `estimada` con `vence_en` a 15 minutos. **No hubo ninguna llamada a Google
  todavía.**
- [ ] Apretar **Confirmar**. El botón queda deshabilitado ("Generando… hasta 2
  min"). En menos de 2 minutos aparecen **2 imágenes** y el **costo real** (algo
  menor que el estimado). En Supabase: `generaciones` pasó a `ok` con
  `costo_real_usd` **distinto de null**; `creativos` tiene 2 filas con `ruta`.
- [ ] **Segundo click / otra pestaña:** estimar de nuevo, abrir la misma pantalla
  en dos pestañas y confirmar en ambas. La segunda muestra **"Ya se confirmó"
  (409)** y no se cobra de nuevo: en `generaciones` hay una sola fila confirmada
  y en Google AI Studio, una sola tanda de requests.
- [ ] **Vencimiento:** estimar y **esperar 15 minutos** sin confirmar. Al confirmar,
  muestra **"La estimación venció… Apretá Ver precio de nuevo" (410)** y no gasta.
- [ ] **Tope:** bajar `PRESUPUESTO_MENSUAL_USD` a `0.01` (en Vercel, redeploy),
  estimar y confirmar: responde **402** con lo que queda del tope y **no llama a
  Google**. Volver a `10` al terminar.
- [ ] **Elegir:** en "Imágenes generadas" (insignia "Desde texto") apretar **Elegir** en una imagen y después en la
  otra: la primera se desmarca (siempre hay una sola "Elegida" por pieza).
- [ ] **Lector:** entrar con un usuario lector: ve el gasto y las imágenes pero **sin**
  opciones, Ver precio, Confirmar ni Elegir (una línea explica que su rol solo permite ver). `POST /api/generaciones` y `PATCH
  /api/creativos/[id]` responden **403**; sin sesión, **401**.
- [ ] **Privacidad del bucket:** copiar la URL de una imagen **sin** el `?token=`
  y abrirla: debe dar un 4xx. Con el token, funciona (dura 1 hora).
- [ ] **Revisar las filas** de `generaciones` y `creativos`: `costo_real_usd`
  nunca es null después de generar, y ninguna columna ni log tiene la clave de
  Gemini ni una URL firmada.
- [ ] **Interruptor:** borrar `PRESUPUESTO_MENSUAL_USD` (y redeploy) apaga todo:
  la pantalla avisa y los endpoints responden 503.
- [ ] **Mirar con ojo crítico dos cosas** que la documentación de Google no
  aclara: (1) qué pasa cuando Gemini **bloquea** una imagen por seguridad (debería
  verse como un error en esa imagen, con su costo); (2) que la subida a Storage
  funcione con la clave secreta. Si algo falla, pasame el mensaje exacto.

## 15 · Probar el Productor con fotos (ADR-023)

Sube una foto real y la edita con Gemini (centavos por imagen). **No hay variables de
entorno nuevas**: se reusan `GEMINI_API_KEY`, `PRESUPUESTO_MENSUAL_USD` y
`MODELO_IMAGEN`. Seguí el orden.

- [ ] **Supabase:** aplicar `supabase/migrations/20261027120000_productor_foto.sql`
  con `supabase db push` **antes** del `git push`: `/creativos` lee `fotos`; sin la
  migración la pantalla falla.
- [ ] **Supabase → Storage:** verificar que el bucket **`fotos`** existe y es
  **privado** (no "Public"), sin policies.
- [ ] `git push`.
- [ ] **Subida real:** entrar a `/creativos` como director u operador, paso 1 con
  "Una foto real de tu moto" → "Subir una foto nueva". Subir una foto de celular de **4032×3024**. Debe quedar en **<= 2048 px
  de lado y < 3 MB**. En Supabase → Storage → `fotos`, descargar el archivo y
  revisar que **no tenga EXIF** (ni GPS).
- [ ] **Derechos:** sin tildar el checkbox, el botón "Subir" queda deshabilitado.
  Por curl, `POST /api/fotos` sin `derechos=acepto` da **422** y no crea ningún
  objeto en el bucket.
- [ ] **Formato:** un PNG renombrado a `.jpg` (mandado por curl) da **415**.
- [ ] **Menú:** elegir la miniatura, "Fondo de estudio", Nano Banana 2.1, variantes **2**,
  **Ver precio**: debe decir **"Confirmar US$ 0,09006"** (el tope con la foto
  presupuestada; docs/05).
- [ ] **Confirmar:** da **2 imágenes**. Compararlas con ojo crítico contra el
  original: **la moto no debe haber cambiado** (forma, color, logos, calcos,
  ruedas). Si cambió, anotar el motor y probar con Gemini 3 Pro Image.
- [ ] **Tokens de entrada (supuesto S1):** en `creativos`, mirar `tokens_entrada` y
  compararlo con los **1120** presupuestados para NB2.1. Pasame el número real.
- [ ] **Outpainting (supuesto S2):** pedir una **historia 9:16** desde una foto
  horizontal ("Solo adaptar el formato"). Verificar que Gemini extiende la escena y
  no deforma ni recorta la moto.
- [ ] **Storage con `sb_secret_` (supuesto S3):** que la descarga previa funcione ya
  queda probado si confirmar generó. Si da 500 "Storage", pasame el mensaje exacto.
- [ ] **Compuerta:** un segundo click da **409**; ver el precio y esperar **15 minutos** da
  **410**; con `PRESUPUESTO_MENSUAL_USD=0.01` da **402** (volver a `10` después).
  En los tres casos, **cero requests nuevas** en Google AI Studio.
- [ ] **Lector:** un usuario lector ve los resultados pero sin Subir,
  Ver precio ni Borrar. `POST /api/fotos` y `DELETE /api/fotos/[id]` dan **403**; sin
  sesión, **401**.
- [ ] **Borrar:** "Borrar esta foto" y confirmar con "Sí, borrar". El objeto desaparece del bucket, la
  fila queda con `borrada_en` y `ruta` null, y las generaciones y creativos
  derivados **se conservan**.
- [ ] **Privacidad:** la URL de una foto o de un resultado **sin** `?token=` da un
  4xx.
- [ ] **Bloqueo de seguridad (supuesto S4):** si Gemini bloquea alguna imagen, debe
  verse como error en esa imagen con su costo. Pasame el mensaje exacto.

## 16 · Probar mensajes en el Analista y editar análisis (ADR-024)

Sin variables de entorno nuevas. Los mensajes (sección 12) tienen que estar
sincronizados para el período que se analice.

- [ ] **Supabase:** aplicar `supabase/migrations/20261028120000_analisis_ediciones.sql`
  (tabla `ediciones_analisis` y función `editar_analisis`). Va **antes** del
  `git push`: sin ella, el historial del tablero falla al leer las ediciones.
- [ ] `git push`.
- [ ] En `/tablero`, elegir una marca con mensajes (sección 12) y apretar **Analizar
  período**. Como el prompt pasó a `analista-v2`, **no** debe salir "desde caché" la
  primera vez. En Supabase, la fila nueva de `analisis` tiene `version_prompt =
  analista-v2`.
- [ ] Leer el análisis: si menciona mensajes, que use las cifras de la tarjeta
  "Mensajes recibidos" y que **no** diga que un post, formato o campaña generó
  mensajes. Si lo hace, pasame el texto exacto.
- [ ] **Editar:** en "Últimos análisis", abrir uno y apretar **Editar**. Cambiar el
  texto y **Guardar como versión 2**. Se ve el texto nuevo, la marca "v2 · editado",
  el "Original del modelo" y la lista de versiones. En Supabase (`ediciones_analisis`)
  hay una fila con `version = 2`, `editado_por` y `editado_en`; la fila de `analisis`
  quedó **igual**. En OpenAI no se gastó nada.
- [ ] Editar de nuevo: aparece la v3. Con dos pestañas abiertas, guardar en la
  segunda sobre la v1 da **409** y el aviso "otra persona cambió este análisis".
- [ ] Volver a **Analizar período** con los mismos filtros de un análisis editado:
  sale "desde caché" y el texto es la versión editada.
- [ ] **Lector:** no ve el botón Editar; `PATCH /api/analisis/[id]` da **403**. Sin
  sesión, **401**.

## 17 · Probar la sincronización orgánica en paralelo (ADR-025)

Variables de entorno: ninguna nueva. Crons: sin cambios (`/api/sync` a las 09:00 y
`/api/sync-organico` a las 09:15 UTC). Sin migraciones.

- [ ] `git push`.
- [ ] Desde tu máquina: `/usr/bin/time -p pnpm sincronizar-organico`. Tiene que
  terminar en `ok`, con las mismas 14 cuentas y ~874 filas, en **bastante menos de
  100 s** (antes 236 s). Si queda `parcial`, el detalle por cuenta ahora incluye
  `mensajes: …` con el motivo.
- [ ] Vercel → Logs: en la próxima corrida del cron `/api/sync-organico`, la
  duración tiene que estar muy por debajo de los 300 s.
- [ ] `/tablero` → **Actualizar estadísticas**: tiene que terminar en ~2–3 minutos
  (publicidad ~70 s + orgánico ~65 s), no en 5. Si pasa de ~200 s, reabrir el ADR-025
  (separar los mensajes en su propio cron).
- [ ] Si Meta devuelve errores de cuota (`#4`, `#17`, `#32`) en los logs, bajar
  `Dependencias.concurrencia` (4 → 2) y avisar.

## 18 · Probar el rediseño de /creativos (ADR-026)

Solo cambió la pantalla: **sin variables de entorno ni migraciones nuevas**. Probalo
con alguien que no conozca el sistema (Julián o un operador) y anotá dónde duda.

- [ ] **Arriba, siempre visible:** "US$ X de US$ Y este mes", la barra y la línea
  "Cada imagen cuesta plata real. Nada se cobra hasta que apretás Confirmar".
- [ ] **Paso 1:** dos opciones grandes. "Una foto real de tu moto" viene marcada y
  dice "Recomendado". Con la foto se ven las miniaturas (la más nueva elegida) y
  "Subir una foto nueva" con la aclaración "Subir es gratis". Sin fotos, el
  formulario de subida ya está abierto.
- [ ] **Paso 1 con texto:** "Un texto ya aprobado" muestra el select de piezas. Sin
  piezas aprobadas, dice cómo conseguirlas y linkea a `/contenido`.
- [ ] **Paso 2:** con foto, las cinco ediciones (nombre, descripción y "hasta US$ X
  por imagen"), el formato como "Cuadrado 1:1 · feed", "Vertical 4:5 · feed" o
  "Historia 9:16", el motor ("rápido y barato" / "más fiel, ~4× el precio") y las
  variantes. Con texto: proporción y brief visual de la pieza, motor y variantes.
- [ ] **Paso 3:** "Ver precio" (gratis) → "Confirmar US$ X" y la leyenda "Recién acá
  se cobra. La estimación vence en 15 minutos". Cambiar **cualquier** opción hace
  desaparecer el botón Confirmar (hay que ver el precio de nuevo). En Google AI
  Studio, **cero requests** hasta apretar Confirmar.
- [ ] **Errores:** doble click en Confirmar = una sola generación. Probar 402, 409
  y 410 como en las secciones 14 y 15: los mensajes se leen en castellano, sin
  códigos.
- [ ] **Imágenes generadas:** una sola galería, la más nueva primero, con la
  insignia "Desde foto" / "Desde texto" y el filtro Todas / Desde foto / Desde
  texto. "Elegir" aparece solo en las de texto; en las de foto dice "Usar en una
  publicación llega en la próxima etapa".
- [ ] **Simulador:** al final, colapsado, "¿Cuánto cuesta cada opción?".
- [ ] **Apagado:** sin `GEMINI_API_KEY` o sin `PRESUPUESTO_MENSUAL_USD` (y redeploy)
  la tarjeta avisa "Generar imágenes está apagado: falta…" y "Ver precio" queda
  deshabilitado. Volver a cargarlas.
- [ ] **Celular:** abrirlo a ancho de teléfono: sin scroll horizontal, las opciones
  se apilan y los botones se alcanzan con el pulgar. Con teclado: Tab llega a cada
  grupo, las flechas cambian la opción y se ve el foco.

## Antes de la demo

- [ ] Confirmar con Julián que "resultado" = conversación de mensajes iniciada o
  lead (ADR-014).
- [ ] Publicaciones de IG y FB: ya son reales (sección 7).

## Para más adelante

- Cambiar o recuperar la clave desde la app. Hoy se resetea desde Supabase.
- Pantalla de administración de usuarios, en lugar del script.
