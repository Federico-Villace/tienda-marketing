# 03 · Esquema de base de datos

Migración: [`supabase/migrations/0001_esquema_inicial.sql`](../supabase/migrations/0001_esquema_inicial.sql)

## Mapa

```
organizaciones ──┬── miembros ──── auth.users
                 │
                 ├── cuentas_meta ──┬── publicaciones ── metricas_publicacion
                 │                  └── campanias ────── metricas_campania
                 ├── sincronizaciones
                 ├── analisis          ← capa 2
                 └── generaciones      ← capa 3 (declarada, sin usar en el MVP)
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

## Sobre RLS

Todas las tablas tienen RLS activo con políticas de **solo lectura** por
pertenencia a la organización.

La escritura no tiene política porque **ningún cliente escribe directo**: la hace
el backend con la `service_role` key, que saltea RLS. El cron y los agentes son
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
