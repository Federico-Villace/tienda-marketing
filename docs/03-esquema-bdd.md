# 03 · Esquema de base de datos

Migración: [`supabase/migrations/20260922115500_esquema_inicial.sql`](../supabase/migrations/20260922115500_esquema_inicial.sql)

## Mapa

```
organizaciones ──┬── miembros ──── auth.users
                 │
                 ├── cuentas_meta ──┬── publicaciones ── metricas_publicacion
                 │                  └── campanias ────── metricas_campania
                 ├── sincronizaciones
                 ├── analisis          ← capa 2
                 ├── planes            ← capa 2 (Estratega, versionado)
                 ├── tandas_contenido ─── piezas  ← capa 2 (Contenidista, versionado)
                 ├── generaciones ──── creativos  ← capa 3 (Productor: la compuerta y sus imágenes)
                 ├── fotos ─────────── (originales del cliente; generaciones y creativos las referencian)
                 └── (buckets privados `creativos` y `fotos` en Storage)
```

## Las cinco decisiones del esquema, y el porqué de cada una

### 1. Toda tabla de ingesta guarda el JSON original en `crudo`

Meta cambia su esquema de respuesta seguido, y cada versión de la Graph API
agrega, renombra o deprecia campos. Si solo guardás columnas tipadas, el día que
quieras un dato que no mapeaste tenés que volver a pedirle todo a Meta — y los
datos viejos quizás ya no estén disponibles.

Con `crudo jsonb` guardás la respuesta completa una sola vez y después
reprocesás sin salir a la red. El costo es disco, que es lo más barato que hay.

### 2. Las métricas son series temporales, no columnas de la publicación

`metricas_publicacion` guarda **una fila por captura**, no pisa el valor
anterior. Un reel que a las 24 horas tenía 1.200 de alcance y a los 7 días tiene
9.000 cuenta una historia que un solo número no cuenta.

Esto es exactamente lo que después le da material al Analista para decir "tus
reels siguen levantando alcance hasta el día 5, tus fotos mueren a las 12 horas".
Con un solo valor guardado, ese análisis es imposible.

### 3. Las métricas de campaña van a grano diario

`metricas_campania` tiene `unique (campania_id, fecha)`. Es el grano que entrega
Meta en `/insights` con `time_increment=1`, y permite recalcular cualquier rango
—una semana, un mes, un trimestre— con un `sum()` en SQL, sin volver a pedirle
nada a Meta.

Si guardaras el total de la campaña, cada rango nuevo sería una llamada nueva a
la API.

### 4. `organizacion_id` en todas las tablas desde el día 1

Hoy hay un solo cliente. Agregar la columna hoy sale **cero**. Agregarla dentro
de seis meses, con datos adentro, significa migrar cada tabla, reescribir cada
consulta y rehacer cada política de RLS.

Es la diferencia entre dejar el caño puesto en la obra o romper la pared después.
El multi-tenant está en el **esquema**; en la **interfaz** no aparece hasta la
fase 4.

### 5. Ningún token en la base de datos

`cuentas_meta.token_ref` guarda el **nombre** de la variable de entorno
(`META_ACCESS_TOKEN`), nunca el valor. En el MVP el token vive en las variables
de entorno de Vercel y solo lo lee el servidor.

Cuando haya varias organizaciones con tokens distintos (fase 4), `token_ref`
pasa a apuntar a un secreto de Supabase Vault. El esquema no cambia: cambia a
qué apunta el campo. Meter Vault ahora, con un token, es sobreingeniería.

## `planes`: versiones inmutables (ADR-018)

Un plan de campaña no se edita: cada edición inserta una fila nueva. `raiz_id`
agrupa las versiones (la primera es su propia raíz, lo completa un trigger),
`padre_id` apunta a la anterior y `unique (raiz_id, version)` impide duplicados.
`estado` es `borrador`, `aprobado`, `descartado` o `reemplazado`, y un índice único
parcial garantiza **un solo aprobado por raíz**. `origen` distingue lo que generó el
agente (con `hash_entrada` para el caché y los tokens) de lo que editó una persona
(costo 0, sin hash). El brief y el plan viajan como `jsonb`; la columna `analisis_id`
dice de qué análisis salió. Los cambios de estado pasan por las funciones
`editar_plan`, `aprobar_plan` y `descartar_plan`, ejecutables solo por `service_role`.

## `ediciones_analisis`: editar análisis anteriores (ADR-024)

`analisis` no cambia: el texto del modelo es la versión 1 y su `hash_entrada` único
sigue siendo el caché. Cada edición humana es una fila de `ediciones_analisis`
(`analisis_id`, `version` desde 2, `contenido` de 1 a 8000 caracteres, `editado_por`,
`editado_en`, `unique (analisis_id, version)`). La vigente es la de mayor versión.
Se escribe solo con `editar_analisis` (plpgsql, bloquea el análisis con `for update`,
PT409 si la versión vista no es la última), ejecutable solo por `service_role`. RLS:
lectura por pertenencia, ninguna política de escritura.

## `tandas_contenido` y `piezas`: el Contenidista (ADR-021)

`tandas_contenido` es lo que el agente escribió en **una** llamada: de qué `plan_id`
y `semana` salió, las `notas` del director, el `hash_entrada` (único por
organización: es el caché), el modelo, los tokens y el `costo_usd` real. No hay
unicidad por plan y semana: otras notas = otra tanda.

`piezas` guarda una fila por **versión** de cada pieza, con el mismo diseño que
`planes`: `raiz_id` agrupa las versiones (la primera es su propia raíz, lo completa
un trigger), `padre_id` apunta a la anterior y `unique (raiz_id, version)` impide
duplicados. `estado` es `borrador`, `aprobada`, `descartada` o `reemplazada`, y un
índice único parcial garantiza **una sola aprobada por raíz**. `origen` distingue
lo que escribió el agente (versión 1) de lo que editó una persona. El contenido
viaja como `jsonb` (`pieza`). Las funciones `guardar_tanda` (atómica: tanda y
piezas, o nada), `editar_pieza`, `aprobar_pieza` y `descartar_pieza` son ejecutables
solo por `service_role`. Ninguna columna guarda tokens ni claves.

## Sobre RLS

Todas las tablas tienen RLS activo con políticas de **solo lectura** por
pertenencia a la organización.

La escritura no tiene política porque **ningún cliente escribe directo**: la hace
el backend con la clave secreta (`sb_secret_…`), que saltea RLS. El cron y los agentes son
el único camino de entrada de datos a la base. Eso hace que el modelo de
seguridad sea fácil de razonar: si un dato está mal, entró por la capa 1.

La función `es_miembro()` es `security definer` a propósito — sin eso, una
política sobre `miembros` que consulta `miembros` entra en recursión infinita.
Es un error clásico de Supabase y así queda evitado desde el arranque.

## Cómo aplicar la migración

Federico corre esto (yo no toco recursos externos):

```bash
supabase link --project-ref <REF_DEL_PROYECTO>
supabase db push
```

O bien pegando el contenido del `.sql` en el editor SQL del panel de Supabase.

## `generaciones` y `creativos`: el Productor (ADR-022)

Migración: [`supabase/migrations/20261026120000_productor.sql`](../supabase/migrations/20261026120000_productor.sql)

`generaciones` ya existía desde el esquema inicial (la compuerta: estimado antes,
real después, quién confirmó). El Productor la usa y le agrega:

| Columna | Para qué |
|---|---|
| `pieza_id`, `pieza_raiz_id` | De qué versión de qué pieza sale. La raíz agrupa las versiones |
| `creado_por` | Quién pidió la estimación |
| `cantidad` (1–4), `aspecto` (`1:1`, `4:5`, `9:16`) | Lo que se pidió; el aspecto lo deriva el servidor del formato |
| `version_prompt` | Versión del prompt (`productor-v1`) |
| `vence_en` | La estimación vale 15 minutos |
| `terminada_en` | Cuándo cerró (ok o error) |

`costo_estimado_usd` y `costo_real_usd` pasan a `numeric(10,6)` (una imagen cuesta
centésimas de centavo). Se guardan **por separado**: el estimado es el **tope** que
se mostró, el real sale de `usage`. El `estado` recorre `estimada` → `confirmada` →
`corriendo` → `ok` o `error`; el único camino de `estimada` a `confirmada` es la
función `confirmar_generacion`.

`creativos` guarda **una fila por imagen**: `ruta` dentro del bucket (nunca una URL
firmada), `mime_type`, `ancho`, `alto`, `aspecto`, `costo_usd` con su `costo_fuente`
(`usage`, `tarifa`, `tope` o `sin_cargo`), los tokens, `error` y `elegida`. Dos
`check` mantienen la coherencia: o hay `ruta` o hay `error`, y solo se elige una
imagen que existe. Un **índice parcial único sobre `pieza_raiz_id`** garantiza como
máximo una elegida por pieza, aunque se reapruebe otra versión.

Funciones (plpgsql, `search_path` vacío, solo `service_role`):
`gasto_generaciones_mes(org)`, `confirmar_generacion(id, tope, usuario)` (PT404,
PT409, PT410, PT402; `for update` sobre `organizaciones`) y `elegir_creativo(id,
elegida, usuario)`.

RLS: `creativos` se lee por pertenencia (`es_miembro`) y no tiene políticas de
escritura. El bucket `creativos` se crea **privado** con `insert into
storage.buckets` y **sin ninguna policy** en Storage: los archivos solo los toca el
servidor.

## `fotos` y el Productor con fotos (ADR-023)

Migración: [`supabase/migrations/20261027120000_productor_foto.sql`](../supabase/migrations/20261027120000_productor_foto.sql)

`fotos` guarda el original que sube el cliente (ya re-encodeado a JPEG, sin EXIF):

| Columna | Para qué |
|---|---|
| `id` | Lo genera el servidor; también es el nombre del archivo |
| `organizacion_id` | Multi-tenant, como el resto |
| `ruta` | `organizacion_id/id.jpg` en el bucket `fotos`. **Null** cuando se borró el objeto (nunca una URL firmada) |
| `mime_type`, `ancho`, `alto`, `bytes` | Solo `image/jpeg`; lados entre 512 y 2048; hasta 4.000.000 bytes |
| `subida_por` | Quién la subió |
| `derechos_por`, `derechos_en`, `derechos_version` | La declaración de derechos: quién, cuándo y con qué texto (`derechos-v1`). Obligatorias |
| `borrada_en`, `borrada_por` | Borrado suave: la fila queda porque `generaciones` y `creativos` la referencian |

Un `check` exige `ruta` salvo que la foto esté borrada. RLS: solo lectura por
pertenencia (`es_miembro`), sin políticas de escritura. El bucket `fotos` se crea
**privado** y **sin ninguna policy** en Storage.

Columnas nuevas:

| Tabla | Columna | Para qué |
|---|---|---|
| `generaciones` | `foto_id` (`on delete restrict`), `edicion` | La generación sale de una foto en lugar de una pieza. `generaciones_un_origen`: nunca pieza y foto a la vez; `generaciones_edicion_con_foto`: `edicion` existe si y solo si hay foto |
| `creativos` | `foto_id` (`on delete restrict`) | El origen de la imagen. `pieza_id` y `pieza_raiz_id` pasan a **nullable** |

Checks de `creativos`: `creativos_un_origen` (`num_nonnulls(pieza_raiz_id, foto_id) =
1`), `creativos_pieza_completa` (`pieza_id` y `pieza_raiz_id` van juntos) y
`creativos_elegida_de_pieza` (solo se elige un creativo de pieza). `elegir_creativo`
conserva su firma y responde PT422 para los de foto. `gasto_generaciones_mes` y
`confirmar_generacion` no cambian.

## `promociones`, `textos_promocion` y `aprobaciones_promocion`: promoción paso a paso (ADR-027)

Migración `20261029120000_promociones.sql`. Aditiva: tres tablas, un enum
(`estado_promocion`: borrador, aprobada, descartada) y una columna nullable en
`generaciones`.

- **`promociones`** es el borrador mutable. `revision` es la concurrencia optimista:
  editar con una revisión vieja es PT409. Guarda marca, modelo, `datos` (precio,
  promo, lugar, indicaciones), la foto (`on delete restrict`), el formato, el diseño
  y el fondo, el análisis y los textos vinculados, el texto elegido (`copy`, con
  `copy_editado`), el titular, la escena elegida y la placa final (`placa_ruta` y
  `placa_hash`: la ruta en el bucket `creativos`, nunca el archivo). Checks: la ruta y
  el hash van juntos; una aprobada siempre tiene texto y placa. No hay columna `paso`
  (se deriva).
- **`textos_promocion`**: cada llamada del redactor (siempre 3 opciones), con
  `hash_entrada` único por organización (caché), `intento` (1 a 20: "pedir otras 3"),
  `datos_hash` (para avisar si cambiaron los datos después) y su costo.
- **`aprobaciones_promocion`**: una fila por aprobación (`version` 1..n, única por
  promoción) con el `snapshot` y la ruta de la placa. Inmutable.
- **`generaciones.promocion_id`**: de qué promoción es una escena. Check: solo con
  foto de origen. La escena es una generación y un creativo comunes.
- **Funciones** (plpgsql, `set search_path = ''`, solo `service_role`, `for update`):
  `editar_promocion` (lista blanca de campos; cambiar la foto o el formato borra la
  escena y la placa), `aprobar_promocion` (PT422 si falta texto o imagen; el snapshot
  sale de la fila, no del cliente), `reabrir_promocion` y `descartar_promocion`.
  `resumen_promocion` (SQL, stable) devuelve el jsonb de agregados del paso 2.
- **RLS**: solo lectura por pertenencia en las tres tablas; ninguna política de
  escritura (regla #5). Ninguna columna guarda tokens (regla #4).
- Los análisis de una promoción viven en `analisis` con `tipo = 'promocion'` y sus
  ediciones en `ediciones_analisis`; el tablero lee solo `tipo = 'rendimiento'`.
