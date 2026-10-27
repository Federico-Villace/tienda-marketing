# 06 · Bitácora de decisiones

Una entrada por decisión que costaría plata revertir. Orden cronológico inverso.

---

## ADR-030 · Placa personalizable: fondo descrito, posiciones, texto propio y foto de inspiración
**27-oct-2026 · Pedido de Julián (999 Motos), vía Federico**

"Agregar campo de prompt para las ideas de los fondos, también posicionamiento y texto
como tal [...] poder describir el fondo que uno quiera, el texto que uno quiera ingresar,
dónde aparecerá, y la posibilidad de adjuntar una foto como inspiración." Todo en el paso 4
de /promocionar y, para varias marcas, en la sección de lote de la tanda. Ninguna regla dura
cambia; hay una migración aditiva (`20261031120000_placa_personalizable.sql`).

| Tema | Elegido | Descartado | Por qué |
|---|---|---|---|
| Descripción del fondo | `promociones.fondo_descripcion` (≤ 300), de una línea, sin los delimitadores `«»` ni caracteres de control. Entra al prompt de escena como «preferencias de fondo», ANTES de las reglas, y el prompt termina con "las reglas de no modificar la moto prevalecen siempre" | Pegar el texto crudo; ponerlo después de las reglas | El texto de la persona es entrada no confiable: delimitado y subordinado, no puede quitar `REGLAS_EDICION_FOTO`. Prompt `promocion-escena-v2` |
| Indicaciones del paso 1 | Ya no van a la escena: eran para quien escribe los textos (y podían traer teléfonos o montos) | Mandarlas a las dos | Un campo por destino. La etiqueta pasa a "Indicaciones para el texto" |
| Dónde va el texto | Se **integra** con el diseño: `plantilla` = estilo (degradado / panel liso) × posición (arriba / abajo / costado) = 6 ids en la MISMA columna. La pantalla muestra dos controles que componen el id | Una columna nueva `posicion_texto` junto a `plantilla` | Dos controles que dicen lo mismo se contradicen. Las tres plantillas viejas siguen siendo válidas (`oferta_abajo`, `oferta_arriba`, `catalogo`) y las promociones aprobadas no se tocan |
| Dónde va la moto | `promociones.posicion_moto` (izquierda / centro / derecha, por defecto centro) que se pasa a Gemini como composición | Dejarlo a criterio de la IA | Es lo que pidió Julián y es determinístico en el prompt |
| Texto al costado | El lado lo decide la moto: el texto va del lado OPUESTO. Con la moto al centro no hay lado: se rechaza (422 en la app, `check` en la base), y la pantalla mueve la moto a la izquierda en el mismo guardado | Elegir el lado aparte | Una sola fuente de verdad; la mitad libre es la que pide el prompt de escena |
| Titular y línea extra | El titular ya existía; se suma `linea_extra` (≤ 60). Los dibuja la plantilla (Anton / Inter), nunca la IA. Límites con contador según dónde va el texto (40 / 60 arriba y abajo, 28 / 36 al costado; el ancho es 1080 en los tres formatos, así que no dependen del aspecto) | Límites por aspecto; dejar que la IA escriba | Regla del producto: lo que se lee lo escribe un humano o la plantilla |
| Montos en la línea extra | `montosNoRespaldados` contra el precio cargado y el detalle de la promo; cualquier otro monto, %, cuotas o USD se **bloquea** (400). Sin emojis (satori los baja de internet) ni teléfonos. El titular sigue sin dígitos | Solo advertir | Mismo criterio que los textos del redactor: el único precio es el que cargó la persona |
| Foto de inspiración | La misma tabla y el mismo camino de las fotos (`fotos.uso = 'inspiracion'`: compresión en el navegador, JPEG, bucket `fotos`, derechos obligatorios y registrados). Va a Gemini como SEGUNDA imagen, con la instrucción de usarla solo como referencia de estilo, luz, paleta y ambiente, sin copiar objetos, textos, logos ni personas | Bucket o tabla propios; subir directo a Storage | Cero infraestructura nueva; la regla #5 se mantiene (la sube el backend) y la subida va en un request aparte, así el body de cada pedido sigue ≤ 4,5 MB |
| Costo de la inspiración | `estimarImagenes({ conFoto, conReferencia })` suma una imagen de entrada más; el valor queda en la generación (`referencia_foto_id`) y `confirmar` lo recalcula (409 si no coincide). Se descarga ANTES de la compuerta | Ignorar la entrada | Regla #3: el tope es conservador y el "Confirmar US$ X" ya lo incluye ("Incluye la foto de inspiración") |
| Tanda | Los mismos campos en "Aplicar a las N": un PATCH por hija. `compartenEscena` compara foto, formato, **posición del texto** (no el estilo: degradado y panel comparten escena), fondo, descripción, posición de la moto e inspiración. Si una hija cambia alguno, deja de compartir (R17) | Un campo de tanda propio | Reusa todo: PATCH, revisión optimista, estimación única |
| Qué invalida qué | `linea_extra` y `posicion_moto` invalidan la placa; la descripción y la inspiración solo cambian la PRÓXIMA escena y no tocan la que ya hay (como el fondo hoy). La placa pasa a `placa-v2` y su hash incluye la zona | Descartar la escena al cambiarlos | Gastar de nuevo es decisión humana (regla #3); la pantalla avisa "conviene generar otra" |
| Aprobación | `aprobar_promocion` suma los cuatro campos al snapshot inmutable | — | Se audita qué se pidió |

**Reglas duras.** #1 y #2 no se tocan (no hay LLM de texto nuevo). #3: la escena sigue
saliendo SOLO por Ver precio → Confirmar US$ X; si falta o se borró cualquiera de las dos
fotos no se cobra ni se llama a Gemini (con tests de cero llamadas). #4: ningún token. #5: las
fotos y las columnas las escribe el backend con la clave secreta. Gemini se llama con
`store: false` y la clave en el header; los errores enmascaran el base64 de las dos fotos.

**Qué NO entra:** más de una foto de inspiración; que la IA dibuje el texto; moto en
cualquier posición libre (solo tres); logos.

---

## ADR-029 · Paridad de filtros: el mismo período, marca y plataforma en todas las pantallas
**26-oct-2026 · Pedido de Federico**

"Todo lo que está en Nueva promoción tiene que estar en el resto de las secciones, y
viceversa" (ej. el filtro de tiempo). Se unifican los controles y las reglas; no cambia
ninguna regla dura ni hay SQL nuevo.

| Tema | Elegido | Descartado | Por qué |
|---|---|---|---|
| Período | `parsearPeriodo` en `lib/datos/filtros.ts` (desde/hasta, ventana de 90 días, ordenado, en la URL) usado por /tablero, el paso 2, la comparación de la tanda y el endpoint de antecedentes | Un control propio por pantalla | Una sola regla: lo que se ve es lo que se analiza. El servidor revalida el body (entrada no confiable) |
| Período en el análisis | Entra a la entrada del LLM (`periodo`) y por lo tanto al hash del caché; las RPC `resumen_promocion*` ya recibían el rango | Fijar siempre 90 días | Otro período = otro análisis, sin cobrar dos veces el mismo |
| Mensajes en la promoción | `resumen_mensajes` (ADR-020) filtrado a las cuentas de la marca, como conteos; el prompt repite que son de la cuenta y no de una publicación (`promocion-antecedentes-v3`) | Atribuir mensajes a la promoción o al modelo | Meta no informa qué publicación originó cada mensaje (ADR-024). Regla #2: solo agregados |
| Filtros comunes | Componente `FiltrosComunes` (marcas + plataforma + período, extras como hijos) sobre `SeleccionMultiple`: chips aplican al tocar, fechas y campos con "Aplicar" | Duplicar el formulario | Mismo comportamiento y mismas etiquetas ("Marcas", "Plataforma", no "Cuentas") |
| URL de marcas | `marca` repetido / `marca=todas` en todas las pantallas; `marcasDeParams` también lee `comparar` | Romper los links de la tanda | Los links compartidos siguen andando; se escribe siempre `marca` |
| /contenido y lista de /promocionar | Marca + plataforma + estado en /contenido; marca + modelo en la lista; sin parámetros no se filtra nada | Filtrar en la base | Son pocas filas; se filtra en TS y se dice cuántas piezas se ocultan |
| Lector | Se ocultan los controles de acción (también "Analizar período", que daba 403) y la pantalla muestra UN `AvisoSoloVer` | Botones deshabilitados y avisos distintos por componente | El endpoint sigue siendo la autoridad; el lector no ve botones que fallan |
| Nombres | "Aprobar" (no "OK"), "Plataforma", "Usar esta imagen" / "Dejar de usar"; costo aproximado en "Analizar período" | — | Un verbo por acción en todo el producto |

**Qué NO entra:** período en el Estratega/Contenidista (trabajan sobre un análisis o plan ya
fijados), filtro de plataforma en Promocionar (la promoción es de la marca, no de una red),
cambiar el período de un análisis ya hecho (se ve el que se usó).

**Reglas duras.** #1 y #2 intactas: los mensajes entran como agregado SQL de conteos;
#3 el análisis sigue siendo un click humano con el costo en el botón; sin migración.

---

## ADR-028 · Multi-marca: filtros con varias marcas y una promoción para varias marcas (tanda)
**25-oct-2026 · Pedido de David (999 Motos), decidido por Federico**

Dos pedidos en uno. (1) Cargar una promoción UNA vez y sacar una pieza (placa + texto)
por concesionario. (2) Poder elegir varias marcas —y varias cuentas— en /tablero y el
Analista, en /campanas (Estratega) y en el paso 2 de Promocionar.

**Decisión.** Un componente único `SeleccionMultiple` (chips que son checkboxes nativos,
"Todas" tri-estado, nunca queda vacío) en dos modos: URL (`marca` repetido en un
formulario GET de `next/form`, con auto-envío y sin JS con "Aplicar") y controlado
(formularios). Las promociones para varias marcas son una **tanda**: un padre
(`tandas_promocion`) con N promociones hijas, una por marca. Ver `docs/03` y `docs/02`.

| Tema | Elegido | Descartado | Por qué |
|---|---|---|---|
| Modelo de la promo | `tandas_promocion` padre + N `promociones` hijas (`tanda_id`) | Una promoción con N marcas | La hija es una promoción normal: reusa revisión optimista, editar, aprobar, reabrir, descartar, snapshot, placa y textos por fila, y el wizard. Con N marcas en una fila habría que volver arrays el copy, la placa y la aprobación y reescribir las cinco RPC |
| Escena | Compartida por defecto: UNA generación con `tanda_id`, un cobro | Una escena por marca | `promptEscena` no usa la marca: N escenas serían pagar N veces lo mismo. La marca va en la placa (`next/og`, gratis) |
| Lotes de IA | Fan-out desde el cliente a los endpoints de siempre (concurrencia 3) tras UN click que muestra el total | Un endpoint de lote en el servidor | Cero backend nuevo, sin riesgo de `maxDuration` (7 × ~40 s), error y reintento por tarjeta, y el caché por hash evita doble cobro. Regla #3: el click muestra el total |
| Crear la tanda | RPC `crear_tanda_promocion` (atómica) | Dos inserts REST | La tanda y las N hijas, o nada |
| SQL del tablero | Sin cambios de firma | Pasar la marca a las RPC | Ya devuelven toda la organización y se filtra en TS (7 marcas, ≤ 90 días) |
| Comparar en el paso 2 | RPC `resumen_promocion_comparado` que llama a `resumen_promocion` por marca × modelo | Reescribir `resumen_promocion` con arrays | Una ida y vuelta, reusa la función testeada, suma Postgres (regla #2) |
| URL | `marca` repetido y `marca=todas` | `marcas=A,B` | `?marca=X` viejo sigue andando y es lo que serializa un form GET |
| Cuentas | Instagram y Facebook como checkboxes (las dos = todas) | Un array nuevo | Se mapea al `PlataformaFiltro` existente |
| Cuentas sueltas (Zontes IG + Suzuki FB) | No: marcas × cuentas | Elegir por cuenta | 14 chips en el celular y es un caso raro |
| Comparativo vs. sumado | Siempre los dos con 2+ marcas | Un toggle | Mismo costo; el toggle duplicaría el caché |
| Publicidad por marca | Atribución por token en el NOMBRE de la campaña, con "compartidas" y "sin marca" aparte | Nada | Hay una sola cuenta publicitaria (R14); sin doble conteo |
| Analista | Entrada v3 (`porMarca` solo con 2+ marcas, `analista-v3`), el conjunto de marcas entra al hash | Una entrada por marca | Un solo análisis que compara y suma; mismo conjunto en cualquier orden = mismo caché |
| Estratega | Cada pieza del calendario lleva `marca` (o null = todas) (`estratega-v2`) | Un plan por marca | Un plan único con el reparto visible; los planes viejos se leen como null |

**Qué NO entra:** logos, publicar o pautar (fase 4), seleccionar cuentas sueltas, un
análisis del modelo de la tanda entera (solo por hija), una escena distinta por marca en
un solo "Confirmar" (se hace por hija con su propia compuerta).

**Reglas duras.** #1 la capa 2 sigue sin llamar a Meta; #2 al modelo solo le llegan
agregados (`porMarca`, `atribucion`, `comparacion` son números); #3 nada gasta solo: los
lotes de texto muestran el total (`~US$ 0,014 (7 × ~US$ 0,002)`) y la imagen sigue siendo
Ver precio → Confirmar US$ X, ahora con el aviso "1 imagen para N"; #4 ningún token; #5
ningún cliente escribe (la tanda se crea por una RPC solo de `service_role`).

---

## ADR-027 · Promoción paso a paso: una entrada única que termina en una placa aprobada
**25-oct-2026 · Pedido de David (999 Motos), decidido por Federico**

David no quiere saber qué agente hace qué: quiere decir "voy a promocionar esta moto
a este precio" y llegar a una imagen y un texto listos. Hasta acá había que saltar
entre /tablero, /contenido y /creativos.

**Decisión.** Una pantalla nueva, `/promocionar`, con seis pasos numerados: 1) qué
promocionás (marca, modelo, precio, promo, foto, formato), 2) cómo les fue (análisis
enfocado de 90 días de ESA marca), 3) tres textos con el precio respaldado, 4) la
imagen (escena de Gemini por la compuerta de siempre + texto compuesto), 5) aprobar
y 6) listo para bajar. Las pantallas de cada agente siguen existiendo bajo
"Herramientas avanzadas". **Termina en "aprobada": publicar en Meta es la fase 4.**
Solo imagen (no video).

| Tema | Elegido | Descartado | Por qué |
|---|---|---|---|
| Entidad | `promociones` (borrador mutable con `revision` optimista) + `aprobaciones_promocion` (snapshot inmutable por aprobación) + `textos_promocion` (cada llamada del redactor) | Versionar la promoción entera en cada cambio | Un wizard cambia campos sueltos veinte veces; versionar cada tecla llena la tabla. Lo que se audita (qué se aprobó, qué escribió la IA) queda inmutable, como en ADR-024 |
| Paso actual | Derivado en código (`pasoActual`) | Columna `paso` | Sin estados inconsistentes (un "4" sin escena) |
| Texto de la placa | Plantilla propia con `next/og` (satori), el MISMO componente en el navegador (vista previa) y en el servidor (PNG) | Que la IA dibuje el texto; canvas en el navegador | El precio sale del dato cargado, jamás de un modelo; el canvas rompería la regla #5 |
| Análisis | Tabla `analisis` con tipo `promocion` | Tabla nueva | Edición, caché e historial gratis; `/tablero` filtra `tipo = rendimiento` |
| Agregados | RPC `resumen_promocion` que suma en Postgres | Filtrar en TS | Regla #2 literal. El modelo se normaliza (`strpos` + `regexp_replace`), sin comodines |
| Campañas | Solo las que mencionan la marca (token) o el modelo en el NOMBRE | Todas | Hay una sola cuenta publicitaria para las 7 marcas: sin el nombre no hay atribución (R14) |
| Costo pasos 2 y 3 | Un click con el precio aproximado en el botón | Compuerta estimar → confirmar | Centavos, coherente con el Analista y el Contenidista |
| Escena | Rama `promocion` en `leerOrigen`: `generaciones.promocion_id`, `edicion = 'promocion'`; `confirmar.ts` sin cambios | Endpoint propio | Reusa compuerta, tope, costo real y galería |
| Servir el PNG | Bucket `creativos` + URL firmada | Devolverlo en la respuesta | Un PNG 1080×1920 puede pasar los 4,5 MB de Vercel |
| Fuentes | Anton (precio y modelo) e Inter SemiBold (resto), OFL, commiteadas en `assets/fuentes` | Geist | Hace falta un condensado pesado para el precio |
| Aprobar | director u operador; se registra quién y cuándo | Solo director | Coherente con planes y piezas |
| Emojis | Prohibidos en modelo, detalle, titular y lugar | twemoji | satori los baja de un CDN en runtime |

**Reglas que se cumplen.** #1 la capa de análisis lee de Postgres, nunca de Meta; #2 al
modelo solo le llegan agregados de SQL (sin ids ni permalinks); #3 la escena pasa por
estimar → Confirmar US$ X → ejecutar, y los pasos de texto muestran su precio en el
botón; los rechazos (401/403/404/409/422/503) no llaman a ningún modelo; #4 ningún
token en una tabla; #5 solo el backend escribe en la base y en Storage.

**Qué no cambia.** `/creativos`, `/contenido`, `/tablero` y `/campanas` siguen igual
(solo cambió la navegación y `/tablero` no muestra los análisis de promociones).

**Desvíos y supuestos.**
- Inter en `google/fonts` es una fuente variable y satori no elige el peso de una
  variable: se usó el OTF estático `Inter-SemiBold` del repositorio oficial
  (`rsms/inter`, v3.19, OFL).
- `PATCH /api/promociones/[id]` acepta también `modelo` y `marcaId` (para volver al paso 1).
- **Verificados en este entorno:** satori corre bajo vitest; `<img>` con
  `objectFit: 'cover'` recorta sin deformar; el glob de `outputFileTracingIncludes`
  es `'/api/promociones/**'` (picomatch: `*` no cruza `/`).
- **A verificar en producción (docs/08 §19):** que las fuentes viajen en el deploy;
  que el PNG de 1080×1920 con foto real pase de 5 MB o no y se suba sin problema;
  que `?download=` en la URL firmada baje el archivo con nombre; que Storage
  responda "ya existe" como 409 (o 400 con "already exists": el código acepta los
  dos); que Gemini respete la zona libre (la banda opaca lo cubre si no).

**Rollback.** La migración es aditiva (tablas nuevas y una columna nullable en
`generaciones`). La bajada está comentada al final de
`supabase/migrations/20261029120000_promociones.sql`.

---

## ADR-026 · /creativos es un solo flujo guiado: partir de foto o de texto, qué querés, precio y confirmar
**23-oct-2026 · Decidido por Federico**

Federico probó `/creativos` y no entendió qué se podía hacer: arriba se creaba una
imagen desde una pieza, en el medio había un simulador de costos y abajo "Tus fotos"
tenía otro menú con su propio Estimar. Dos formularios casi iguales apilados.

**Decisión (solo frontend).** Una tarjeta "Crear imagen" con tres pasos numerados:
1) ¿de dónde partís? (foto real, recomendada, o texto aprobado), 2) ¿qué querés?
(edición y formato en la foto; motor y variantes en ambos), 3) precio y
confirmación. Una sola galería "Imágenes generadas" con insignia de origen y
filtro. El simulador de costos pasó a un `<details>` colapsado al final. La barra
de gasto del mes y la frase "Nada se cobra hasta que apretás Confirmar" van
siempre arriba.

**Qué no cambia.** La compuerta es la misma (regla #3): `usarCompuerta`, los mismos
endpoints y la misma estimación del servidor. "Estimar" pasó a llamarse "Ver precio".
Los códigos 402, 409 y 410 se dicen en castellano. "Elegir para la pieza" sigue solo
en las de texto: una foto no es una pieza, y en las de foto una leyenda explica que
usarla en una publicación llega en la próxima etapa. Se fusionaron `productor.tsx`,
`fotos.tsx` y `menu-foto.tsx` en `crear-imagen.tsx`; `galeria.tsx` y `subir-foto.tsx`
se reusan.

**A validar:** que alguien que no conoce el sistema llegue a una imagen confirmada
sin ayuda (docs/08, sección 18).

---

## ADR-025 · La ingesta orgánica corre con concurrencia acotada (4 cuentas a la vez)
**23-oct-2026 · Decidido por Federico**

`pnpm sincronizar-organico` tardó **236 s** (212 s en la medición con timing) para
14 cuentas contra un `maxDuration` de 300 s. El cron orgánico y, sobre todo,
`/api/actualizar` (publicidad + orgánico en la misma función) estaban a un día
lento de Meta del timeout. El CPU de usuario fue 2 s: todo era espera de red,
llamadas en serie.

**Dónde se iba el tiempo** (medición del 23-oct, suma de latencias por tipo de llamada):

| Llamada | Cantidad | Tiempo |
|---|---|---|
| `{page}/conversations?platform=instagram` | 17 | **95 s** (~5,6 s c/u) |
| `{page}/posts` con insights anidados + sin ellos | 26 | 53 s |
| Supabase (upserts, serie) | 58 | 31 s |
| `{page}/conversations?platform=messenger` | 9 | 8,5 s |
| `{ig}/media` con y sin insights | 14 | 16 s |
| `{page}/insights` (conversaciones nuevas) | 8 | 4,5 s |
| `me/accounts` | 1 | 1,8 s |

No había recuperación uno por uno (0 recuperadas, 1 sin métricas). Lo caro son las
conversaciones de Instagram (la paginación de a 100 hasta salir de la ventana) y
que 14 cuentas y 7 páginas se procesaban una después de la otra.

**Decisión:** un limitador propio (`lib/ingesta/concurrencia.ts`, `enParalelo`,
sin dependencias) y `CONCURRENCIA_ORGANICA = 4`:

- Las **cuentas** (posts/media + upserts) corren de a 4.
- Después, los **mensajes** de las **páginas** corren de a 4.
- Cada cuenta sigue usando su propio page token. Los límites de Meta se cuentan
  por página/app (BUC) y 4 llamadas en vuelo quedan lejos de la cuota; el
  reintento con backoff del ADR-010 sigue igual.
- Una cuenta que falla queda como dato en su lugar del resultado (mismo orden que
  antes): estado `parcial`, ADR-019. No tumba a las que corren a la par.
- `Dependencias.concurrencia` (opcional) permite bajar a 1 (serie) sin tocar código.

**Resultado medido:** `pnpm sincronizar-organico` pasó de **236 s a 65 s**, estado
`ok`, mismas 874 filas. Publicidad (una cuenta, serie) tarda **69 s**, así que
`/api/actualizar` ronda los **135 s** de 300.

**Alternativas descartadas:**
- *Cron propio para mensajes/métricas de cuenta (`/api/sync-mensajes`)*: con 65 s
  el orgánico completo y 135 s el botón hay más del 50 % de margen. Separarlo suma
  una ruta, un cron, un tipo de sincronización y un estado más para el tablero sin
  resolver nada hoy. **Se reabre si** `/api/actualizar` supera ~200 s o si crece el
  número de páginas (con 4 en paralelo, cada 4 páginas más suman ~30 s).
- *Paralelizar publicidad con orgánico*: comparten la cuota de la Graph API
  (ADR-010); sumaría presión sin necesidad.
- *Subir el límite a 8 o más*: la ganancia se achata (el cuello pasa a ser la
  página más lenta, Instagram conversations) y se acerca al límite por página.
- *Librería (`p-limit`)*: son 15 líneas; no vale una dependencia.

**Consecuencias:** el script de consola ahora imprime también `errorMensajes` por
cuenta (antes un `parcial` no decía por qué). Sin variables de entorno ni crons
nuevos; no hay migraciones. Pasos de prueba en `docs/08` sección 17.

---

## ADR-024 · El Analista recibe los mensajes recibidos y sus análisis se pueden editar
**23-oct-2026 · Decidido por Federico**

Cierra dos pendientes del backlog de la fase 1 y 2 (`analista-mensajes-y-edicion`).

**Mensajes en el payload.** `armarEntrada` suma `mensajes`: para la marca y la
plataforma filtradas, las conversaciones activas, las nuevas y los mensajes de
Facebook (Messenger) e Instagram, leídos con `resumen_mensajes` (ADR-020), es decir,
**un agregado de SQL**, nunca filas (regla #2). Donde Meta no informa el dato
(Instagram no da `message_count` ni conversaciones nuevas) viaja `null`. No viajan ids
de cuenta. La entrada lleva una `nota` y el prompt una regla nueva: Meta **no informa
qué publicación originó cada mensaje**, así que el modelo no puede atribuir mensajes a
un post, formato o campaña. Si falla la lectura de mensajes, falla el análisis (500)
en vez de guardar en el caché un análisis sin ellos.

**Versión de prompt.** El payload nuevo cambia el hash y el texto de las
instrucciones cambia: `VERSION_PROMPT` pasa de `analista-v1` a `analista-v2` (el test
que congela el sha del prompt se actualizó). Consecuencia: los análisis cacheados con
v1 ya no coinciden; el primer pedido de cada filtro se vuelve a pagar (centésimas de
centavo) y los viejos siguen en el historial.

**Editar análisis anteriores.** Mismo patrón que el Estratega (ADR-018) y el
Contenidista (ADR-021), con una diferencia: las ediciones viven en una **tabla
aparte**, `ediciones_analisis` (versión 2, 3, ...). El original que escribió el modelo
queda intacto en `analisis` (v1), y `analisis` conserva su `unique (organizacion_id,
hash_entrada)`, que es el caché. Se descartó insertar la edición como fila de
`analisis`: chocaría con esa unicidad o obligaría a inventar un hash. La versión
vigente es la última edición. `editar_analisis` (plpgsql, `for update`) exige que la
versión que la persona veía sea la última, si no PT409 (HTTP 409); inexistente es
PT404; texto vacío o de más de 8000 caracteres, 22023. Solo `service_role` la ejecuta.
`PATCH /api/analisis/[id]` (`{ contenido, version }`): sin sesión 401, lector 403,
director y operador editan. **No llama a OpenAI ni a Meta y no cuesta.** Un pedido que
cae en el caché de un análisis editado devuelve la versión vigente. En `/tablero`, cada
análisis anterior tiene "Editar" (solo director y operador), muestra "vN · editado" con
la fecha, el original del modelo y la lista de versiones.

**Supuestos a verificar en producción:** que `editar_analisis` responda 200 vía
PostgREST con el tipo compuesto de retorno (igual que `editar_pieza`), y que el
prompt v2 no atribuya mensajes a publicaciones.

---

## ADR-023 · El Productor edita fotos reales: subida comprimida en el navegador, derechos versionados y bucket propio
**22-oct-2026 · Decidido por Federico**

Segundo cambio de la fase 3 (`productor-foto`). Se sube una foto real de una moto
y el Productor ofrece un **menú fijo** de ediciones con su precio: fondo de
estudio, escenario urbano, ruta abierta, espacio para texto y solo adaptar el
formato. Pasa por la **misma compuerta** del ADR-022: estimar, mostrar, click,
ejecutar. `confirmar_generacion` y `gasto_generaciones_mes` no cambian.

**Subida: el navegador comprime, el servidor revalida.** El navegador decodifica
con `createImageBitmap(..., {imageOrientation:'from-image'})` (aplica la
orientación EXIF), achica a 2048 px y re-encodea a JPEG con calidades decrecientes
hasta bajar de 3 MB. El re-encode **elimina el EXIF y el GPS**. Va por
`POST /api/fotos` (multipart, `maxDuration 30`). El servidor revisa
`content-length` (<= 4,2 MB) **antes de parsear**, la declaración de derechos, el
tamaño (<= 4.000.000 B), el magic JPEG y las medidas (lado mayor <= 2048, menor >=
512). Solo JPEG. Se descartó la **signed upload URL** (upload directo a Storage):
rompería la regla #5 (ningún cliente escribe en Storage) y la salida es 1K, así que
una resolución completa no aporta. Vercel corta a 4,5 MB (`FUNCTION_PAYLOAD_TOO_LARGE`)
y con `proxy.ts` Next trunca en silencio, por eso se valida lo que llega.

**Derechos obligatorios y versionados.** Sin el checkbox no hay botón, y por curl
el servidor responde 422 **sin tocar Storage**. Cada foto guarda quién aceptó
(`derechos_por`), cuándo (`derechos_en`) y con qué texto (`derechos_version`,
hoy `derechos-v1`). Cambiar el texto obliga a subir la versión.

**Bucket `fotos`, propio, privado y sin policies.** Los originales del cliente
tienen otra vida (borrado, derechos) que los derivados de IA (`creativos`). La
tabla `fotos` tiene RLS de solo lectura por pertenencia. El borrado es **suave**:
se marca `borrada_en`, se borra el objeto y recién después `ruta` queda null; si el
objeto no se puede borrar, la ruta se conserva y la respuesta trae `pendiente:true`.
Las generaciones y los creativos derivados se **conservan** (`on delete restrict`),
porque son la auditoría de derechos y de costo. Retención: hasta que alguien borre
la foto a mano; no hay vencimiento automático.

**La foto es independiente de las piezas.** El formato lo elige el menú; no obliga
a pasar por `/contenido`. Una generación nace de una pieza **o** de una foto
(`generaciones_un_origen`) y un creativo tiene exactamente un origen
(`creativos_un_origen`). Los creativos de una foto **no son elegibles**: la
"elegida" sirve para publicar una pieza (fase 4) y una foto no es una pieza.
`elegir_creativo` responde PT422 (mismo tipo de retorno: `create or replace`) y un
check lo respalda.

**La entrada se presupuesta.** La foto que se manda suma tokens de entrada, y el
tope es conservador a propósito: `tokensImagenEntrada` = **560** en Gemini 3 Pro
Image (oficial: "560 tokens or $0.0011 per image") y **1120** en Nano Banana 2.1
(**supuesto**: el máximo de `media_resolution` por defecto, no está publicado). Tope
por imagen con foto: NB2.1 US$ 0,04503 y Pro US$ 0,18612 (docs/05). El costo real
sigue saliendo de `usage.total_input_tokens`, que ya incluye la imagen.

**Confirmar descarga antes de la compuerta.** Para una foto, `confirmar` lee la fila
(404/410), descarga los bytes de Storage y recalcula el precio con foto (409 si
cambió) **antes** de la RPC. Si Storage falla, responde 500 sin confirmar: no queda
ninguna fila contando en el tope y no se llamó a Gemini. Si la RPC rechaza
(402/409/410), tampoco hay requests a Gemini.

**Sin análisis de visión previo.** Un modelo describiendo la foto gastaría antes del
click (regla #3). El menú es fijo y el prompt (`productor-foto-v1`) manda conservar
la moto (forma, proporciones, color, logos y emblemas, calcos, ruedas, ópticas) y no
agregar texto, precios, logos nuevos, personas ni marcas de agua. No dice "sin
logos": los de la moto real se conservan.

**Riesgos abiertos (supuestos a verificar en `docs/08` sección 15):** (S1) los
tokens de entrada de NB2.1 por imagen no están publicados; se presupuestan 1120 y se
comparan con `usage`. (S2) Que `aspect_ratio` mande sobre el aspecto de la foto de
entrada (outpainting) en una historia 9:16 desde una foto horizontal. (S3) Que el GET
`/object/authenticated` de Storage funcione con la clave `sb_secret_` (igual que la
subida, no se probó en producción). (S4) La forma del bloqueo de seguridad sigue sin
estar documentada (ADR-022) y con fotos de personas puede pasar más seguido. (S5) Que
Gemini **altere la moto**: lo mitigan el prompt, el aviso en pantalla y la revisión
humana; Pro Image es la opción de mayor fidelidad. (S6) HEIC: Safari lo decodifica y
Chrome no; el mensaje pide exportar a JPEG. (S7) Memoria: 4 pedidos en paralelo con
un base64 de hasta ~4 MB son ~16 MB, aceptable.

**Rollback:** borrar `PRESUPUESTO_MENSUAL_USD` apaga el gasto. La migración
`20261027120000_productor_foto.sql` es aditiva y trae la bajada comentada. No agrega
variables de entorno.

---

## ADR-022 · El Productor: imágenes con Gemini, y la compuerta de costo vive en el servidor
**21-oct-2026 · Decidido por Federico**

Abre la fase 3. De una pieza **aprobada** (formato imagen, carrusel o historia)
genera de 1 a 4 imágenes con la Gemini API. Es el primer agente que **gasta
dólares**, así que la regla #3 se cumple en el **servidor**, no solo en la
pantalla. No hace video ni edición de fotos (cambios aparte) ni publica (fase 4).

**Dos pasos, dos endpoints.** (1) `POST /api/generaciones` `{piezaId, motor,
cantidad}`: el servidor calcula la estimación y la guarda como fila `estimada`
que **vence a los 15 minutos**; no llama a Google. (2) `POST
/api/generaciones/[id]/confirmar`: recalcula el precio, ejecuta la RPC
`confirmar_generacion` y **recién entonces** hace las requests. El cliente nunca
manda un precio (cualquier campo de costo en el body se ignora) y nunca recibe
base64.

**La compuerta es una función atómica de Postgres.** `confirmar_generacion` pasa
de `estimada` a `confirmada` y controla, en este orden: que exista (404), que siga
`estimada` (**409**, el segundo click), que no haya vencido (**410**) y que
gastado del mes + estimado no supere el tope (**402**). Se serializa con
`for update` sobre la fila de la organización (el idiom del repo), así dos
confirmaciones simultáneas no pueden pasarse del tope. Solo `service_role` la
ejecuta. Sin ese `OK` no hay ninguna request a Gemini: lo vigilan los tests.

**Tope mensual obligatorio.** `PRESUPUESTO_MENSUAL_USD` ausente, no numérica o
`<= 0` apaga el Productor (503, cero llamadas). El gasto es el del mes calendario
de Buenos Aires: costo real de lo ya generado y, para lo que sigue en vuelo, el
estimado. Una generación que murió a mitad queda `corriendo` y sigue contando por
su estimado (conservador); la pantalla la marca "interrumpida" pasados 10
minutos.

**Costo real por `usage`, siempre un número.** La respuesta de Google no informa
el costo; informa tokens. El real se calcula como entrada + salida de imagen +
(texto + pensamiento), cada uno a su precio oficial (docs/05). Si falta `usage`
se registra la tarifa fija por imagen exitosa; una respuesta sin imagen pero con
`usage` se cobra igual (Google la cobró); un error de red sin respuesta cuenta 0
y un **timeout** (que puede haberse cobrado) se registra al tope por imagen. El
estimado que se muestra y se compara con el tope es un **tope**: lista +
presupuesto de entrada y de pensamiento.

**Interactions API, `store:false`.** `POST /v1beta/interactions` con la clave en el
header `x-goog-api-key` (nunca en la URL ni en el body), `image_size: "1K"` (con
K mayúscula; `1k` se rechaza), `aspect_ratio` según el formato (historia 9:16;
imagen y carrusel 4:5 en Instagram y 1:1 en Facebook) y salida JPEG, que es lo
que exigirá Instagram en la fase 4. Con `store` en true Google retiene el brief
55 días; `store:false` lo evita (y obliga a la ejecución síncrona, no en
background). Una request por imagen, en paralelo, máximo 4, timeout de 120 s cada
una, `maxDuration = 300`. En Nano Banana 2.1 se pide `thinking_level: minimal`.

**Motores y precios: una sola fuente.** `lib/productor/precios.ts` (con URL y
fecha de verificación) manda; `lib/creativos/motores.ts` y el simulador de la home
derivan de ahí. Un motor sin precio es un error **antes** de cualquier llamada.
Imagen 4 está apagado y Veo 3.1 se apaga el 22-oct-2026: salen del catálogo. El
video queda como "referencial, no disponible". **Cierra R5 para imagen.**

**Storage privado + URLs firmadas.** Las imágenes van al bucket privado
`creativos` (`organizacion_id/generacion_id/orden.jpg`), sin ninguna policy: solo
el servidor (clave secreta) lee y escribe. El cliente recibe URLs firmadas de 1
hora, que **no se guardan** en ninguna tabla. Una fila de `creativos` por imagen
(ruta, aspecto, costo, tokens, error). Los límites (10 MB; jpeg, png o webp) se
validan en el código, no en el bucket.

**Una "elegida" por raíz de pieza.** El índice parcial único va sobre
`pieza_raiz_id`, no sobre la versión: si se reaprueba una versión de la pieza, la
imagen no se pierde. `elegir_creativo` apaga la anterior antes de marcar la nueva.

**El prompt** sale de `briefVisual` + marca + formato + cinco reglas fijas: sin
texto en la imagen, sin logos ni marcas, sin patentes legibles, sin personas
reconocibles, sin marcas de agua. El hook y el copy no entran. Se guarda en
`generaciones.prompt` (versión `productor-v1`); nunca lleva la clave.

**Riesgos abiertos:** (1) La forma de un bloqueo de seguridad de Gemini **no está
documentada**: el parseo es defensivo (sin bloque de imagen = error, con el costo
por `usage`) y hay que mirarlo en la prueba de `docs/08` sección 14. (2) Se asume
que `total_thought_tokens` no está incluido en `total_output_tokens`; si lo
estuviera, se sobrecobra un poco (lado conservador). (3) La subida a Storage con la
clave `sb_secret_` como `Bearer` es lo que hace supabase-js, pero **no se probó en
producción**. (4) **Una IA puede inventar detalles de la moto** (logos, piezas,
patentes): lo cubren las reglas del prompt, el aviso en pantalla y la revisión
humana; para fotos reales ver el ADR-023.

**Rollback:** borrar `PRESUPUESTO_MENSUAL_USD` apaga el gasto al instante. La
migración es aditiva e incluye el SQL de bajada comentado.

---

## ADR-021 · El Contenidista: piezas de texto por semana, versionadas, con montos respaldados por el plan
**21-oct-2026 · Decidido por Federico**

Cierra la fase 2. Toma un plan **aprobado** y escribe, por semana, las piezas en
texto (hook, copy, hashtags, CTA, guion, brief visual y texto alternativo). Cada
pieza tiene **OK**, **Editar** y **Descartar**, con versiones. No genera imágenes
ni videos (fase 3) ni publica nada (fase 4).

**Qué recibe el modelo (regla #2):** el texto de la versión aprobada del plan
(objetivo, mensaje central, público, marcas y cuentas de Instagram, **sin
presupuesto**), la fila de **una** semana y las notas opcionales (hasta 1000
caracteres). Nunca filas, agregados, ids, permalinks ni claves; un test lo vigila.

**Una llamada por semana, tope de 12 piezas.** Un plan entero no entra en
6000 tokens ni en 90 s; por pieza repetiría la entrada y obligaría a un click por
pieza. Si la semana pide más de 12, responde 422 "Editá el plan". La salida usa
8000 tokens como máximo.

**Tandas cacheadas por hash.** El hash incluye el id exacto del plan (su versión),
la semana, las notas, la versión del prompt (`contenidista-v1`) y el modelo. El
mismo pedido sale de la base sin cobrar; **regenerar es cambiar las notas**. Por
eso no hay botón "regenerar" ni una restricción de unicidad por plan y semana:
varias tandas de la misma semana conviven y la pantalla muestra la última.

**Piezas versionadas, mismas reglas que `planes`.** `tandas_contenido` (lo que
escribió el agente en una llamada) y `piezas` (cada fila es una versión de una
pieza: `raiz_id`, `padre_id`, `version`, `origen`, `estado`). Las transiciones van
por funciones plpgsql con `for update` y `PT409` (copiadas del SQL de `planes`,
que ya corrió en producción): `guardar_tanda` (atómica: la tanda y todas sus
piezas, o nada; si fallaran las piezas, el hash cachearía una tanda vacía),
`editar_pieza`, `aprobar_pieza` y `descartar_pieza`. Solo `service_role` las
ejecuta. **No se hizo un helper SQL genérico** para las tres de transición: el
tipo de retorno cambia (`planes`/`piezas`), el SQL dinámico pierde el chequeo de
compilación y habría que tocar una migración que ya funciona. Son ~40 líneas por
copia, vigiladas por tests de texto.

**Montos que el modelo no puede inventar.** El prompt exige que precios, cuotas,
tasas, descuentos y stock salgan del plan o de las notas; si no, `[precio]`.
Como el modelo igual puede inventar uno, el endpoint **reemplaza** por `[precio]`
(de forma determinista, por cifra normalizada) todo monto que no figure en lo que
el modelo recibió **antes** de validar: no se tira una llamada ya pagada por un
número. La pantalla marca "precio a completar" y la persona lo escribe. Las
**ediciones humanas están exentas** del control de montos (la persona es la fuente
de lo que escribe) pero siguen sujetas a los límites de Meta. Cualquier **otra**
pieza inválida rechaza la tanda entera (502) y no se persiste nada; el costo
gastado queda en el log, nunca el texto del modelo.

**Límites de Meta que valida el código** (`lib/contenidista/limites.ts`): copy 2200
(Instagram, **verificado**; el de Facebook se **asume** igual), 30 hashtags
(contando los del copy), 20 menciones, texto alternativo 1000. Las menciones solo
pueden ser cuentas de las marcas (evita etiquetar cuentas reales inventadas). La
historia no lleva copy ni hashtags. Sin emails ni teléfonos; WhatsApp solo si
aparece en el plan o las notas.

**"Plan desactualizado" es derivado, no un campo.** Se muestra cuando el plan de la
tanda ya no es el aprobado (se aprobó una versión nueva). No hay trigger ni
escrituras extra. Las piezas no se invalidan: la persona decide.

**Ancla de fechas:** la semana N va de `ventana.desde + (N-1)·7` días a 6 días
después (o el fin de la ventana). El plan aprobado es la única entrada.

**Costo:** ~US$ 0,002 por semana con `gpt-6-luna` (tope ~US$ 0,004 con 8000
tokens de salida). Editar, aprobar y descartar cuestan US$ 0.

**Riesgos abiertos:** (1) `guardar_tanda` usa `jsonb_array_elements ... with
ordinality` y **nunca corrió en un Postgres real**: se prueba con `docs/08`
sección 13. (2) El límite de 2200 de Facebook no está verificado. (3) El reemplazo
por `[precio]` puede dejar frases torpes ("en [precio]"): la persona las edita;
es mejor que publicar un precio falso.

---

## ADR-020 · Mensajes recibidos: se cuentan por cuenta y día, nunca se lee ni se guarda el contenido
**21-oct-2026 · Decidido por Federico**

Julián pidió ver los mensajes recibidos como conversión en el orgánico. Sondeo de
solo lectura el 20-oct con el page token de Zontes (ver `docs/04`).

**Qué se mide** (tabla `metricas_cuenta`, una fila por cuenta y día argentino):

- `conversaciones_activas`: conversaciones **cuya última actividad cayó ese día**
  (`updated_time` de `GET /{page}/conversations`). Cada conversación cuenta en un
  solo día, el de su último movimiento; sumar un período ≈ conversaciones con
  actividad en el período. No es "conversaciones iniciadas".
- `mensajes`: suma de `message_count` de esas conversaciones. **Solo Messenger.**
- `conversaciones_nuevas`: insight de página `page_messages_new_conversations_unique`
  (period=day). **Solo Messenger.** El día es el de `end_time` menos un día; Meta
  corta los días en hora del Pacífico, así que hay un corrimiento de horas respecto
  del día argentino (aproximación documentada).
- Se reescriben los 90 días en cada corrida (determinista); los días sin actividad
  quedan en 0.

**Qué es imposible, y por qué:**

- **Atribuir un mensaje a una publicación.** Meta no expone qué post o anuncio
  originó una conversación de orgánico. Por eso el dato es de la **cuenta** y se
  muestra por período, junto a las publicaciones, nunca "dentro" de una.
- **Mensajes de Instagram:** `message_count` viene en 0/ausente y no hay métrica
  de conversaciones nuevas. Instagram solo tiene "activas"; `mensajes` y `nuevas`
  quedan en `null` ("Meta no lo informa"), no en 0.
- `page_messages_total_messaging_connections` devuelve vacío: no se usa.

**Regla de privacidad (dura):** se guardan **solo conteos**. Nunca se persiste ni
se loguea contenido de mensajes, nombres o ids de participantes, ids de
conversación ni snippets. Se piden únicamente los campos `updated_time,message_count`
y la lectura descarta cualquier otro campo que Meta devuelva (el id de la
conversación llega igual); el `crudo` de la tabla contiene solo los conteos
agregados y el valor del insight de página. Hay un test que falla si un id de
conversación, un participante o un snippet aparece en una escritura, en el
resultado o en la consola.

**Cómo falla:** el paso corre por página, después de los posts. Si falla (permiso,
cuota, tope de páginas), los posts de la cuenta ya están guardados y la corrida
queda `parcial` con el detalle (`<página>: mensajes: <plataforma>: <error>`). Cada
lectura es independiente: si falla solo Instagram, Messenger se guarda igual; si
falla el insight de nuevas, `conversaciones_nuevas` no se pisa. Tope de 50 páginas
de conversaciones por plataforma: si no llega al inicio de la ventana, falla en vez
de guardar un conteo truncado.

**No incluido:** el Analista **no** recibe estos números en este cambio (cambiaría
el hash de su caché, ADR-017). Queda como seguimiento: agregarlos al payload agregado.

**Costo:** cero (sin IA). Cuota de Meta: 2 a 3 llamadas más por página y por corrida,
más una por cada 100 conversaciones.

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
| R5 | Los precios de los motores salen de comparativas, no de páginas oficiales | 🟡 Abierto para video · 🟢 Cerrado para texto (20-oct) e imagen (21-oct) | El texto usa la página oficial de OpenAI (ADR-017) y la imagen la de Google (ADR-022, `lib/productor/precios.ts`). Video: es referencial y no se puede generar; confirmar antes de cotizar, colchón del 20% |
| R9 | Si Login for Business emite tokens de usuario, vencen a los ~60 días | 🟢 Ya no aplica | La ingesta usa el token del bot, que no vence (ADR-013) |
| R10 | El system user de Login for Business no recibe `ads_read` | 🟢 Esquivado | Se usa el system user "Bot Replit" (ADR-013) |
| R11 | El token del bot puede gastar y publicar (34 permisos) | 🟡 Abierto | La regla #3 la hace cumplir el código. Antes de la fase 4, system user con permisos mínimos |
| R12 | ~~El tablero muestra datos reales del cliente y todavía no tiene login~~ | 🟢 Resuelto 14-oct | Login propio con Supabase Auth (ADR-015) |
| R13 | Supuestos del Productor con fotos (ADR-023): tokens de entrada de NB2.1 (1120), `aspect_ratio` sobre la foto de entrada, GET de Storage con `sb_secret_` y que Gemini no altere la moto | 🟡 Abierto | Se verifican en `docs/08` sección 15; el tope presupuesta la entrada de forma conservadora |
| R14 | Las campañas de Meta no tienen marca (hay una sola cuenta publicitaria): el paso 2 de la promoción las atribuye solo si el NOMBRE menciona la marca o el modelo | 🟡 Abierto | Se dice en el análisis. Para atribuir de verdad hay que convenir una convención de nombres o separar cuentas (ADR-027) |
| R15 | satori y el navegador pueden diferir unos píxeles (fuentes, saltos de línea), y el límite de ancho es una estimación | 🟡 Abierto | La vista previa se rotula "aproximada"; "Ver la versión final" arma el PNG real. Los textos que no entran dan un error en castellano (ADR-027) |
| R16 | La publicidad por marca en el tablero y en el Analista sale del NOMBRE de la campaña (amplía R14): una campaña que nombra dos marcas es "compartida" y una que no nombra ninguna de las elegidas queda "sin marca en el nombre" | 🟡 Abierto | Se rotula "aproximado" y el prompt lo repite. Convenir una convención de nombres o separar cuentas (ADR-028) |
| R17 | Una hija de la tanda puede pedir su propia escena (cambiar el fondo o el diseño solo en ella) y divergir de la imagen compartida | 🟡 Abierto | La estimación de la tanda se rechaza con 422 diciendo qué difiere; la hija sigue con su compuerta de siempre. Aplicar el mismo diseño y fondo a todas (ADR-028) |
| R18 | Los lotes se orquestan desde el navegador: cerrar la pestaña corta el lote | 🟡 Abierto | Lo ya hecho queda guardado y cuenta como hecho; se retoma tocando de nuevo (el caché por hash evita doble cobro). Un worker en el servidor es el paso siguiente si hace falta (ADR-028) |
| R19 | Gemini puede no respetar la posición de la moto, la descripción del fondo o la zona libre, o copiar elementos de la foto de inspiración pese a la instrucción | 🟡 Abierto | La legibilidad no depende de la IA (banda o panel opaco detrás del texto); la moto la protege `REGLAS_EDICION_FOTO` y la persona elige entre 2 variantes antes de aprobar. Se verifica en `docs/08` sección 22 (ADR-030) |
| R20 | La foto de inspiración puede tener derechos de terceros | 🟡 Abierto | Misma declaración de derechos obligatoria y registrada que la foto de la moto; nunca se publica, solo orienta el estilo de una escena nueva (ADR-030) |

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

