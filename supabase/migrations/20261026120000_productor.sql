-- El Productor: imágenes desde una pieza aprobada, con la compuerta de costo en el SERVIDOR.
--
-- · La compuerta (regla dura #3) vive acá: `confirmar_generacion` es la única
--   forma de pasar de `estimada` a `confirmada`, y lo hace de forma atómica
--   controlando el vencimiento (PT410), el doble click (PT409) y el tope
--   mensual (PT402). Sin esa transición el backend no llama a Gemini.
-- · Se serializa con `for update` sobre la fila de la organización (idiom del
--   repo): dos confirmaciones simultáneas no pueden pasarse del tope.
-- · El gasto del mes es el del calendario de Buenos Aires: lo real cuando ya
--   se conoce y el estimado de lo que sigue en vuelo.
-- · Un creativo es UNA imagen. Los archivos viven en el bucket privado
--   `creativos`, sin ninguna policy: solo el servidor (clave secreta) lee y
--   escribe, y el cliente recibe URLs firmadas de vida corta que NO se guardan.
-- · Una sola imagen "elegida" por raíz de pieza: si se reaprueba otra versión,
--   la imagen no se pierde.
-- · Las funciones solo las ejecuta service_role (regla dura #5). PT402/PT404/
--   PT409/PT410 son los códigos que PostgREST traduce a HTTP.

-- ═══════════════════════════════════════════════════════════════
-- generaciones: lo que la compuerta necesita saber
-- ═══════════════════════════════════════════════════════════════

alter table generaciones
  add column pieza_id       uuid references piezas(id) on delete restrict,
  add column pieza_raiz_id  uuid references piezas(id) on delete restrict,
  add column creado_por     uuid references auth.users(id) on delete set null,
  add column cantidad       integer check (cantidad between 1 and 4),
  add column aspecto        text check (aspecto in ('1:1', '4:5', '9:16')),
  add column version_prompt text,
  add column vence_en       timestamptz,
  add column terminada_en   timestamptz,
  alter column costo_estimado_usd type numeric(10,6),
  alter column costo_real_usd type numeric(10,6);

create index generaciones_mes on generaciones (organizacion_id, confirmada_en);
create index on generaciones (pieza_raiz_id, creado_en desc);

-- ═══════════════════════════════════════════════════════════════
-- creativos: una fila por imagen
-- ═══════════════════════════════════════════════════════════════

create table creativos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id) on delete cascade,
  generacion_id      uuid not null references generaciones(id) on delete cascade,
  pieza_id           uuid not null references piezas(id) on delete restrict,
  pieza_raiz_id      uuid not null references piezas(id) on delete restrict,
  orden              integer not null check (orden between 1 and 4),
  -- Ruta dentro del bucket: organizacion_id/generacion_id/orden.jpg
  ruta               text,
  mime_type          text,
  ancho              integer,
  alto               integer,
  aspecto            text not null,
  costo_usd          numeric(10,6) not null default 0,
  costo_fuente       text not null check (costo_fuente in ('usage', 'tarifa', 'tope', 'sin_cargo')),
  tokens_entrada     integer not null default 0,
  tokens_imagen      integer not null default 0,
  tokens_texto       integer not null default 0,
  tokens_pensamiento integer not null default 0,
  error              text check (char_length(error) <= 500),
  elegida            boolean not null default false,
  elegido_por        uuid references auth.users(id) on delete set null,
  elegido_en         timestamptz,
  creado_en          timestamptz not null default now(),
  -- O hay imagen o hay error, nunca ninguno ni los dos.
  check ((ruta is null) = (error is not null)),
  check (not elegida or ruta is not null),
  unique (generacion_id, orden)
);

create unique index creativos_una_elegida on creativos (pieza_raiz_id) where elegida;
create index on creativos (organizacion_id, pieza_raiz_id);

alter table creativos enable row level security;
create policy "lectura por pertenencia" on creativos
  for select using (es_miembro(organizacion_id));

-- ═══════════════════════════════════════════════════════════════
-- Bucket privado de imágenes. Sin policies en el schema de storage: ni los
-- usuarios ni la clave publicable pueden leer o escribir; el servidor sí.
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('creativos', 'creativos', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- Gasto del mes (calendario de Buenos Aires)
-- ═══════════════════════════════════════════════════════════════

create function public.gasto_generaciones_mes(p_org uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
    select coalesce(sum(
      case
        when g.estado in ('confirmada', 'corriendo') then g.costo_estimado_usd
        else coalesce(g.costo_real_usd, g.costo_estimado_usd)
      end
    ), 0)
    from public.generaciones g
    where g.organizacion_id = p_org
      and g.confirmada_en is not null
      and g.estado in ('confirmada', 'corriendo', 'ok', 'error')
      and g.confirmada_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- LA COMPUERTA: estimada → confirmada, atómica
-- ═══════════════════════════════════════════════════════════════

create function public.confirmar_generacion(p_id uuid, p_tope numeric, p_usuario uuid)
returns public.generaciones
language plpgsql
set search_path = ''
as $$
declare
  v public.generaciones;
  v_gastado numeric;
begin
  if p_tope is null or p_tope <= 0 then
    raise exception 'El tope mensual no es válido' using errcode = '22023';
  end if;

  select * into v from public.generaciones where id = p_id;
  if not found then
    raise exception 'La generación no existe' using errcode = 'PT404';
  end if;

  -- Serializa todas las confirmaciones de la organización: el gasto que se lee
  -- abajo ya incluye a las que ganaron antes.
  perform 1 from public.organizaciones where id = v.organizacion_id for update;
  select * into v from public.generaciones where id = p_id for update;

  if v.estado <> 'estimada' then
    raise exception 'Ya se confirmó' using errcode = 'PT409';
  end if;
  if v.vence_en is null or v.vence_en < now() then
    raise exception 'La estimación venció' using errcode = 'PT410';
  end if;

  v_gastado := public.gasto_generaciones_mes(v.organizacion_id);
  if v_gastado + v.costo_estimado_usd > p_tope then
    raise exception 'Supera el tope mensual' using errcode = 'PT402';
  end if;

  update public.generaciones
     set estado = 'confirmada', confirmada_por = p_usuario, confirmada_en = now()
   where id = p_id
  returning * into v;

  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Elegir la imagen de una pieza (una por raíz)
-- ═══════════════════════════════════════════════════════════════

create function public.elegir_creativo(p_id uuid, p_elegida boolean, p_usuario uuid)
returns public.creativos
language plpgsql
set search_path = ''
as $$
declare
  v public.creativos;
begin
  select * into v from public.creativos where id = p_id;
  if not found then
    raise exception 'El creativo no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.creativos where pieza_raiz_id = v.pieza_raiz_id for update;
  select * into v from public.creativos where id = p_id;

  -- Solo se elige una imagen que existe.
  if v.ruta is null then
    raise exception 'Ese creativo no tiene imagen' using errcode = 'PT409';
  end if;

  if p_elegida then
    -- Primero se libera a la anterior: el índice parcial admite una sola.
    update public.creativos
       set elegida = false, elegido_por = null, elegido_en = null
     where pieza_raiz_id = v.pieza_raiz_id and elegida and id <> p_id;
    update public.creativos
       set elegida = true, elegido_por = p_usuario, elegido_en = now()
     where id = p_id
    returning * into v;
  else
    update public.creativos
       set elegida = false, elegido_por = null, elegido_en = null
     where id = p_id
    returning * into v;
  end if;

  return v;
end;
$$;

revoke all on function public.gasto_generaciones_mes(uuid) from public, anon, authenticated;
grant execute on function public.gasto_generaciones_mes(uuid) to service_role;
revoke all on function public.confirmar_generacion(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_generacion(uuid, numeric, uuid) to service_role;
revoke all on function public.elegir_creativo(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.elegir_creativo(uuid, boolean, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer. El bucket debe estar vacío antes):
-- drop function public.elegir_creativo(uuid, boolean, uuid);
-- drop function public.confirmar_generacion(uuid, numeric, uuid);
-- drop function public.gasto_generaciones_mes(uuid);
-- drop table creativos;
-- delete from storage.buckets where id = 'creativos';
-- drop index generaciones_mes;
-- alter table generaciones
--   drop column pieza_id, drop column pieza_raiz_id, drop column creado_por, drop column cantidad,
--   drop column aspecto, drop column version_prompt, drop column vence_en, drop column terminada_en;
