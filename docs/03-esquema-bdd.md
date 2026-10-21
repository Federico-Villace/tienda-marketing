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
                 └── (bucket privado `creativos` en Storage)
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
