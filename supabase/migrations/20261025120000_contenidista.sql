-- El Contenidista: tandas de piezas de texto por semana de un plan aprobado.
--
-- · Una pieza es una PROPUESTA de texto (hook, copy, guion, brief visual):
--   nada de esto se publica ni genera imágenes todavía.
-- · Una tanda es lo que el agente escribió en UNA llamada (una semana de un plan).
--   Se cachea por hash de la entrada: varias tandas de la misma semana conviven
--   (otras notas = otra tanda), por eso no hay una restricción de unicidad por plan y semana.
-- · Cada pieza es una cadena de versiones inmutables: editar inserta una fila
--   nueva (raiz_id igual, padre_id = la anterior, version + 1). Una aprobada
--   sigue vigente hasta que se aprueba la nueva.
-- · Los cambios viven en funciones plpgsql (PostgREST no hace transacciones de
--   varias sentencias), copiadas del patrón de `planes` que ya corre en
--   producción. Solo las ejecuta service_role. Una versión que ya no es la
--   vigente responde PT409, que PostgREST traduce a HTTP 409.
-- · Ningún cliente escribe (regla dura #5) y ninguna columna guarda tokens ni
--   credenciales (regla dura #4).

create type estado_pieza as enum ('borrador', 'aprobada', 'descartada', 'reemplazada');
create type origen_pieza as enum ('agente', 'edicion');

create table tandas_contenido (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references organizaciones(id) on delete cascade,
  plan_id             uuid not null references planes(id) on delete restrict,
  semana              integer not null check (semana between 1 and 13),
  notas               text check (char_length(notas) <= 1000),
  hash_entrada        text not null,
  version_prompt      text not null,
  modelo              text not null,
  tokens_entrada      integer not null default 0,
  tokens_salida       integer not null default 0,
  tokens_cacheados    integer not null default 0,
  tokens_razonamiento integer not null default 0,
  costo_usd           numeric(10,6) not null default 0,
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now()
);

create unique index tandas_contenido_hash on tandas_contenido (organizacion_id, hash_entrada);
create index on tandas_contenido (plan_id, semana, creado_en desc);

create table piezas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tanda_id        uuid not null references tandas_contenido(id) on delete cascade,
  plan_id         uuid not null references planes(id) on delete restrict,
  semana          integer not null check (semana between 1 and 13),
  orden           integer not null check (orden >= 1),
  -- La primera versión es su propia raíz: lo completa el trigger de abajo.
  raiz_id         uuid not null references piezas(id) on delete cascade,
  padre_id        uuid references piezas(id) on delete set null,
  version         integer not null check (version >= 1),
  origen          origen_pieza not null,
  estado          estado_pieza not null default 'borrador',
  pieza           jsonb not null,
  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  aprobado_por    uuid references auth.users(id) on delete set null,
  aprobado_en     timestamptz,
  -- Solo la versión 1 la escribe el agente; el resto son ediciones.
  check ((origen = 'agente') = (version = 1)),
  -- Una aprobada siempre tiene fecha; una reemplazada conserva la que tenía.
  check (estado <> 'aprobada' or aprobado_en is not null),
  unique (raiz_id, version)
);

create unique index piezas_una_aprobada on piezas (raiz_id) where estado = 'aprobada';
create index on piezas (tanda_id, orden);
create index on piezas (organizacion_id, plan_id, semana);

create function public.piezas_raiz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.raiz_id := coalesce(new.raiz_id, new.id);
  return new;
end;
$$;

create trigger piezas_raiz before insert on piezas
  for each row execute function public.piezas_raiz();

alter table tandas_contenido enable row level security;
create policy "lectura por pertenencia" on tandas_contenido
  for select using (es_miembro(organizacion_id));

alter table piezas enable row level security;
create policy "lectura por pertenencia" on piezas
  for select using (es_miembro(organizacion_id));

-- ═══════════════════════════════════════════════════════════════
-- Guardar una tanda: la tanda y TODAS sus piezas, o nada. Con dos inserts por
-- REST, si fallaran las piezas el hash cachearía una tanda vacía.
-- ═══════════════════════════════════════════════════════════════

create function public.guardar_tanda(p_tanda jsonb, p_piezas jsonb)
returns public.tandas_contenido
language plpgsql
set search_path = ''
as $$
declare
  v_tanda public.tandas_contenido;
begin
  if jsonb_typeof(p_tanda) is distinct from 'object' then
    raise exception 'La tanda debe ser un objeto' using errcode = '22023';
  end if;
  if jsonb_typeof(p_piezas) is distinct from 'array' or jsonb_array_length(p_piezas) not between 1 and 12 then
    raise exception 'Las piezas deben ser entre 1 y 12' using errcode = '22023';
  end if;

  begin
    insert into public.tandas_contenido
      (organizacion_id, plan_id, semana, notas, hash_entrada, version_prompt, modelo,
       tokens_entrada, tokens_salida, tokens_cacheados, tokens_razonamiento, costo_usd, creado_por)
    values
      ((p_tanda->>'organizacion_id')::uuid, (p_tanda->>'plan_id')::uuid, (p_tanda->>'semana')::integer,
       p_tanda->>'notas', p_tanda->>'hash_entrada', p_tanda->>'version_prompt', p_tanda->>'modelo',
       coalesce((p_tanda->>'tokens_entrada')::integer, 0), coalesce((p_tanda->>'tokens_salida')::integer, 0),
       coalesce((p_tanda->>'tokens_cacheados')::integer, 0), coalesce((p_tanda->>'tokens_razonamiento')::integer, 0),
       coalesce((p_tanda->>'costo_usd')::numeric, 0), (p_tanda->>'creado_por')::uuid)
    returning * into v_tanda;
  exception when unique_violation then
    -- Otro pedido igual ganó la carrera: el backend relee la tanda por hash.
    raise exception 'Esa tanda ya existe' using errcode = 'PT409';
  end;

  insert into public.piezas
    (organizacion_id, tanda_id, plan_id, semana, orden, version, origen, estado, pieza, creado_por)
  select
    v_tanda.organizacion_id, v_tanda.id, v_tanda.plan_id, v_tanda.semana, e.orden, 1, 'agente', 'borrador', e.valor, v_tanda.creado_por
  from jsonb_array_elements(p_piezas) with ordinality as e(valor, orden);

  return v_tanda;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Transiciones. Todas bloquean TODA la raíz (for update) y exigen que el id sea
-- la última versión y la que la persona estaba viendo (p_version).
-- ═══════════════════════════════════════════════════════════════

create function public.editar_pieza(p_id uuid, p_version integer, p_pieza jsonb, p_usuario uuid)
returns public.piezas
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.piezas;
  v_punta integer;
  v_nueva public.piezas;
begin
  if jsonb_typeof(p_pieza) is distinct from 'object' then
    raise exception 'La pieza debe ser un objeto' using errcode = '22023';
  end if;

  select raiz_id into v_raiz from public.piezas where id = p_id;
  if not found then
    raise exception 'La pieza no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.piezas where raiz_id = v_raiz for update;
  select * into v_fila from public.piezas where id = p_id;
  select max(version) into v_punta from public.piezas where raiz_id = v_raiz;

  if v_fila.version <> p_version
     or v_fila.version <> v_punta
     or v_fila.estado not in ('borrador', 'aprobada') then
    raise exception 'Esta pieza cambió: recargá' using errcode = 'PT409';
  end if;

  insert into public.piezas
    (organizacion_id, tanda_id, plan_id, semana, orden, raiz_id, padre_id, version, origen, estado, pieza, creado_por)
  values
    (v_fila.organizacion_id, v_fila.tanda_id, v_fila.plan_id, v_fila.semana, v_fila.orden, v_raiz, p_id, v_punta + 1, 'edicion', 'borrador', p_pieza, p_usuario)
  returning * into v_nueva;

  -- Una aprobada sigue vigente hasta aprobar la versión nueva.
  if v_fila.estado = 'borrador' then
    update public.piezas set estado = 'reemplazada' where id = p_id;
  end if;

  return v_nueva;
end;
$$;

create function public.aprobar_pieza(p_id uuid, p_version integer, p_usuario uuid)
returns public.piezas
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.piezas;
  v_punta integer;
  v_pieza public.piezas;
begin
  select raiz_id into v_raiz from public.piezas where id = p_id;
  if not found then
    raise exception 'La pieza no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.piezas where raiz_id = v_raiz for update;
  select * into v_fila from public.piezas where id = p_id;
  select max(version) into v_punta from public.piezas where raiz_id = v_raiz;

  if v_fila.version <> p_version or v_fila.version <> v_punta or v_fila.estado <> 'borrador' then
    raise exception 'Esta pieza cambió: recargá' using errcode = 'PT409';
  end if;

  -- Primero se libera a la aprobada anterior: el índice parcial admite una sola.
  update public.piezas set estado = 'reemplazada' where raiz_id = v_raiz and estado = 'aprobada';
  update public.piezas
     set estado = 'aprobada', aprobado_por = p_usuario, aprobado_en = now()
   where id = p_id
  returning * into v_pieza;

  return v_pieza;
end;
$$;

create function public.descartar_pieza(p_id uuid, p_version integer)
returns public.piezas
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.piezas;
  v_punta integer;
  v_pieza public.piezas;
begin
  select raiz_id into v_raiz from public.piezas where id = p_id;
  if not found then
    raise exception 'La pieza no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.piezas where raiz_id = v_raiz for update;
  select * into v_fila from public.piezas where id = p_id;
  select max(version) into v_punta from public.piezas where raiz_id = v_raiz;

  if v_fila.version <> p_version or v_fila.version <> v_punta or v_fila.estado <> 'borrador' then
    raise exception 'Esta pieza cambió: recargá' using errcode = 'PT409';
  end if;

  update public.piezas set estado = 'descartada' where id = p_id returning * into v_pieza;
  return v_pieza;
end;
$$;

revoke all on function public.guardar_tanda(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_tanda(jsonb, jsonb) to service_role;
revoke all on function public.editar_pieza(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.editar_pieza(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.aprobar_pieza(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_pieza(uuid, integer, uuid) to service_role;
revoke all on function public.descartar_pieza(uuid, integer) from public, anon, authenticated;
grant execute on function public.descartar_pieza(uuid, integer) to service_role;
