-- El Estratega: planes de campaña versionados (borrador / aprobado).
--
-- · Un plan es una PROPUESTA: nada de esto se ejecuta en Meta.
-- · Las versiones son inmutables: editar inserta una fila nueva (raiz_id igual,
--   padre_id = la anterior, version + 1). Un aprobado sigue vigente hasta que se
--   aprueba el nuevo.
-- · Los cambios de estado viven en funciones plpgsql (PostgREST no hace
--   transacciones de varias sentencias). Solo las ejecuta service_role (el
--   backend). `security invoker` alcanza: service_role saltea RLS.
-- · Una versión que ya no es la vigente responde PT409, que PostgREST traduce a
--   HTTP 409.
-- · Ningún cliente escribe (regla dura #5) y ninguna columna guarda tokens ni
--   claves (regla dura #4).

create type estado_plan as enum ('borrador', 'aprobado', 'descartado', 'reemplazado');
create type origen_plan as enum ('agente', 'edicion');

create table planes (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id) on delete cascade,
  -- La primera versión es su propia raíz: lo completa el trigger de abajo.
  raiz_id            uuid not null references planes(id) on delete cascade,
  padre_id           uuid references planes(id) on delete set null,
  version            integer not null check (version >= 1),
  origen             origen_plan not null,
  estado             estado_plan not null default 'borrador',
  analisis_id        uuid not null references analisis(id) on delete restrict,
  brief              jsonb not null,
  plan               jsonb not null,
  -- Solo los planes del agente tienen hash (caché); una edición no.
  hash_entrada       text,
  version_prompt     text,
  modelo             text,
  tokens_entrada     integer not null default 0,
  tokens_salida      integer not null default 0,
  tokens_cacheados   integer not null default 0,
  tokens_razonamiento integer not null default 0,
  costo_usd          numeric(10,6) not null default 0,
  creado_por         uuid references auth.users(id) on delete set null,
  creado_en          timestamptz not null default now(),
  aprobado_por       uuid references auth.users(id) on delete set null,
  aprobado_en        timestamptz,
  check ((origen = 'agente') = (hash_entrada is not null)),
  -- Un aprobado siempre tiene fecha; un reemplazado conserva la que tenía.
  check (estado <> 'aprobado' or aprobado_en is not null),
  unique (raiz_id, version)
);

create unique index planes_hash_agente on planes (organizacion_id, hash_entrada) where origen = 'agente';
create unique index planes_un_aprobado on planes (raiz_id) where estado = 'aprobado';
create index on planes (organizacion_id, creado_en desc);

create function public.planes_raiz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.raiz_id := coalesce(new.raiz_id, new.id);
  return new;
end;
$$;

create trigger planes_raiz before insert on planes
  for each row execute function public.planes_raiz();

alter table planes enable row level security;
create policy "lectura por pertenencia" on planes
  for select using (es_miembro(organizacion_id));

-- ═══════════════════════════════════════════════════════════════
-- Transiciones. Todas bloquean TODA la raíz (for update) y exigen que el id sea
-- la última versión y la que la persona estaba viendo (p_version).
-- ═══════════════════════════════════════════════════════════════

create function public.editar_plan(p_id uuid, p_version integer, p_plan jsonb, p_usuario uuid)
returns public.planes
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.planes;
  v_punta integer;
  v_nueva public.planes;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    raise exception 'El plan debe ser un objeto' using errcode = '22023';
  end if;

  select raiz_id into v_raiz from public.planes where id = p_id;
  if not found then
    raise exception 'El plan no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.planes where raiz_id = v_raiz for update;
  select * into v_fila from public.planes where id = p_id;
  select max(version) into v_punta from public.planes where raiz_id = v_raiz;

  if v_fila.version <> p_version
     or v_fila.version <> v_punta
     or v_fila.estado not in ('borrador', 'aprobado') then
    raise exception 'Este plan cambió: recargá' using errcode = 'PT409';
  end if;

  insert into public.planes
    (organizacion_id, raiz_id, padre_id, version, origen, estado, analisis_id, brief, plan, costo_usd, creado_por)
  values
    (v_fila.organizacion_id, v_raiz, p_id, v_punta + 1, 'edicion', 'borrador', v_fila.analisis_id, v_fila.brief, p_plan, 0, p_usuario)
  returning * into v_nueva;

  -- Un aprobado sigue vigente hasta aprobar la versión nueva.
  if v_fila.estado = 'borrador' then
    update public.planes set estado = 'reemplazado' where id = p_id;
  end if;

  return v_nueva;
end;
$$;

create function public.aprobar_plan(p_id uuid, p_version integer, p_usuario uuid)
returns public.planes
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.planes;
  v_punta integer;
  v_plan  public.planes;
begin
  select raiz_id into v_raiz from public.planes where id = p_id;
  if not found then
    raise exception 'El plan no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.planes where raiz_id = v_raiz for update;
  select * into v_fila from public.planes where id = p_id;
  select max(version) into v_punta from public.planes where raiz_id = v_raiz;

  if v_fila.version <> p_version or v_fila.version <> v_punta or v_fila.estado <> 'borrador' then
    raise exception 'Este plan cambió: recargá' using errcode = 'PT409';
  end if;

  -- Primero se libera al aprobado anterior: el índice parcial admite uno solo.
  update public.planes set estado = 'reemplazado' where raiz_id = v_raiz and estado = 'aprobado';
  update public.planes
     set estado = 'aprobado', aprobado_por = p_usuario, aprobado_en = now()
   where id = p_id
  returning * into v_plan;

  return v_plan;
end;
$$;

create function public.descartar_plan(p_id uuid, p_version integer)
returns public.planes
language plpgsql
set search_path = ''
as $$
declare
  v_raiz  uuid;
  v_fila  public.planes;
  v_punta integer;
  v_plan  public.planes;
begin
  select raiz_id into v_raiz from public.planes where id = p_id;
  if not found then
    raise exception 'El plan no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.planes where raiz_id = v_raiz for update;
  select * into v_fila from public.planes where id = p_id;
  select max(version) into v_punta from public.planes where raiz_id = v_raiz;

  if v_fila.version <> p_version or v_fila.version <> v_punta or v_fila.estado <> 'borrador' then
    raise exception 'Este plan cambió: recargá' using errcode = 'PT409';
  end if;

  update public.planes set estado = 'descartado' where id = p_id returning * into v_plan;
  return v_plan;
end;
$$;

revoke all on function public.editar_plan(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.editar_plan(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.aprobar_plan(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_plan(uuid, integer, uuid) to service_role;
revoke all on function public.descartar_plan(uuid, integer) from public, anon, authenticated;
grant execute on function public.descartar_plan(uuid, integer) to service_role;
