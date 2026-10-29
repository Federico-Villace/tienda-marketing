-- Editar con IA (ADR-034): pedir un cambio sobre una imagen ya generada y sobre un texto.
--
-- · IMAGEN: un cambio es una generación nueva (`base_creativo_id` + `instruccion`) que pasa por
--   la compuerta de siempre (estimar → Confirmar → confirmar_generacion con el tope mensual).
--   No hay un camino de gasto paralelo (regla dura #3).
-- · TEXTO: `conversaciones` (una por promoción o por pieza) y `turnos_conversacion` (un pedido
--   y su respuesta). Cuestan centavos, así que no hay compuerta de click: el tope vive en
--   Postgres (`abrir_turno`: turnos por ítem, costo por ítem y costo diario de la organización),
--   y se abre ANTES de llamar a OpenAI.
-- · Las tres funciones son genéricas por (objeto, id) para que el Analista conversacional sume
--   su objeto después con una migración aditiva, sin cambiar firmas.
-- · Ningún cliente escribe (regla #5): solo service_role ejecuta las funciones; las tablas
--   tienen RLS con lectura por pertenencia y ninguna política de escritura.
-- · Ninguna columna guarda tokens ni credenciales (regla #4).
-- · PT404 / PT409 / PT429 / 22023 son los códigos que PostgREST traduce a HTTP.

-- ═══════════════════════════════════════════════════════════════
-- generaciones: un cambio pedido sobre una imagen ya generada
-- ═══════════════════════════════════════════════════════════════

alter table public.generaciones
  add column base_creativo_id uuid references public.creativos(id) on delete restrict,
  add column instruccion text check (instruccion is null or char_length(instruccion) between 3 and 400),
  add constraint generaciones_ajuste_completo check ((base_creativo_id is null) = (instruccion is null)),
  add constraint generaciones_ajuste_sin_lote check (base_creativo_id is null or lote_id is null),
  add constraint generaciones_ajuste_sin_referencia check (base_creativo_id is null or referencia_foto_id is null);

create index on public.generaciones (base_creativo_id);

-- ═══════════════════════════════════════════════════════════════
-- conversaciones y turnos
-- ═══════════════════════════════════════════════════════════════

create table public.conversaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  promocion_id    uuid references public.promociones(id) on delete cascade,
  pieza_raiz_id   uuid references public.piezas(id) on delete cascade,
  turnos          integer not null default 0 check (turnos >= 0),
  costo_usd       numeric(10,6) not null default 0 check (costo_usd >= 0),
  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint conversaciones_un_objeto check (num_nonnulls(promocion_id, pieza_raiz_id) = 1)
);

create unique index conversaciones_una_por_promocion on public.conversaciones (promocion_id) where promocion_id is not null;
create unique index conversaciones_una_por_pieza on public.conversaciones (pieza_raiz_id) where pieza_raiz_id is not null;
create index on public.conversaciones (organizacion_id, actualizado_en desc);

create table public.turnos_conversacion (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  conversacion_id    uuid not null references public.conversaciones(id) on delete cascade,
  turno              integer not null check (turno >= 1),
  pedido             text not null check (char_length(pedido) between 1 and 400),
  respuesta          jsonb,
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'ok', 'error')),
  error              text check (char_length(error) <= 500),
  pedido_por         uuid references auth.users(id) on delete set null,
  modelo             text,
  version_prompt     text,
  tokens_entrada     integer not null default 0,
  tokens_salida      integer not null default 0,
  tokens_cacheados   integer not null default 0,
  tokens_razonamiento integer not null default 0,
  costo_usd          numeric(10,6) not null default 0 check (costo_usd >= 0),
  creado_en          timestamptz not null default now(),
  respondido_en      timestamptz,
  unique (conversacion_id, turno),
  check (estado <> 'ok' or respuesta is not null)
);

create unique index turnos_un_pendiente on public.turnos_conversacion (conversacion_id) where estado = 'pendiente';
create index on public.turnos_conversacion (organizacion_id, creado_en);

alter table public.conversaciones enable row level security;
alter table public.turnos_conversacion enable row level security;

create policy "lectura por pertenencia" on public.conversaciones
  for select using (public.es_miembro(organizacion_id));
create policy "lectura por pertenencia" on public.turnos_conversacion
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

-- ═══════════════════════════════════════════════════════════════
-- abrir_turno: el tope, ANTES de gastar
-- ═══════════════════════════════════════════════════════════════
-- · Serializa con el lock de la organización (idioma del repo) y de la conversación.
-- · Un pendiente de más de 120 s se da por vencido (el proceso se cayó).
-- · PT409: ya hay un pedido en curso (doble click). PT429: tope de turnos del ítem, de costo del
--   ítem o de costo del día (de Buenos Aires) de la organización.

create function public.abrir_turno(
  p_org uuid, p_objeto text, p_objeto_id uuid, p_pedido text, p_usuario uuid,
  p_estimado numeric, p_max_turnos integer, p_tope numeric, p_tope_diario numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_promocion uuid;
  v_pieza     uuid;
  v_conv      public.conversaciones;
  v_turno     integer;
  v_id        uuid;
  v_dia       timestamptz;
  v_hoy       numeric;
begin
  if p_pedido is null or char_length(p_pedido) not between 1 and 400 then
    raise exception 'El pedido tiene que tener entre 1 y 400 caracteres' using errcode = '22023';
  end if;
  if p_objeto is null or p_objeto not in ('promocion', 'pieza') then
    raise exception 'El objeto del pedido no es válido' using errcode = '22023';
  end if;
  if p_estimado is null or p_estimado < 0
     or p_max_turnos is null or p_max_turnos < 1
     or p_tope is null or p_tope <= 0
     or p_tope_diario is null or p_tope_diario <= 0 then
    raise exception 'Los topes no son válidos' using errcode = '22023';
  end if;

  perform 1 from public.organizaciones where id = p_org for update;

  if p_objeto = 'promocion' then
    select id into v_promocion from public.promociones where id = p_objeto_id and organizacion_id = p_org;
    if v_promocion is null then
      raise exception 'La promoción no existe' using errcode = 'PT404';
    end if;
    insert into public.conversaciones (organizacion_id, promocion_id, creado_por)
      values (p_org, v_promocion, p_usuario)
      on conflict (promocion_id) where promocion_id is not null do nothing;
    select * into v_conv from public.conversaciones where promocion_id = v_promocion for update;
  else
    select raiz_id into v_pieza from public.piezas where id = p_objeto_id and organizacion_id = p_org;
    if v_pieza is null then
      raise exception 'La pieza no existe' using errcode = 'PT404';
    end if;
    insert into public.conversaciones (organizacion_id, pieza_raiz_id, creado_por)
      values (p_org, v_pieza, p_usuario)
      on conflict (pieza_raiz_id) where pieza_raiz_id is not null do nothing;
    select * into v_conv from public.conversaciones where pieza_raiz_id = v_pieza for update;
  end if;

  update public.turnos_conversacion
     set estado = 'error', error = 'vencido', respondido_en = now()
   where conversacion_id = v_conv.id and estado = 'pendiente'
     and creado_en < now() - interval '120 seconds';

  if exists (select 1 from public.turnos_conversacion where conversacion_id = v_conv.id and estado = 'pendiente') then
    raise exception 'Ya hay un pedido en curso' using errcode = 'PT409';
  end if;

  if v_conv.turnos >= p_max_turnos then
    raise exception 'Llegaste al máximo de cambios para este ítem' using errcode = 'PT429';
  end if;
  if v_conv.costo_usd + p_estimado > p_tope then
    raise exception 'Se superó el tope de gasto de este ítem' using errcode = 'PT429';
  end if;

  v_dia := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  select coalesce(sum(costo_usd), 0) into v_hoy
    from public.turnos_conversacion
   where organizacion_id = p_org and creado_en >= v_dia;
  if v_hoy + p_estimado > p_tope_diario then
    raise exception 'Se superó el tope de gasto de hoy' using errcode = 'PT429';
  end if;

  select coalesce(max(turno), 0) + 1 into v_turno from public.turnos_conversacion where conversacion_id = v_conv.id;

  insert into public.turnos_conversacion (organizacion_id, conversacion_id, turno, pedido, pedido_por)
    values (p_org, v_conv.id, v_turno, p_pedido, p_usuario)
    returning id into v_id;

  return jsonb_build_object('conversacionId', v_conv.id, 'turnoId', v_id, 'turno', v_turno);
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- cerrar_turno / fallar_turno
-- ═══════════════════════════════════════════════════════════════

create function public.cerrar_turno(
  p_turno uuid, p_respuesta jsonb, p_modelo text, p_version text, p_tokens jsonb, p_costo numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.turnos_conversacion;
begin
  if jsonb_typeof(p_respuesta) is distinct from 'object' then
    raise exception 'La respuesta tiene que ser un objeto' using errcode = '22023';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'El costo no es válido' using errcode = '22023';
  end if;

  select * into v from public.turnos_conversacion where id = p_turno for update;
  if not found then
    raise exception 'El turno no existe' using errcode = 'PT404';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'El turno ya se cerró' using errcode = 'PT409';
  end if;

  update public.turnos_conversacion
     set estado = 'ok', respuesta = p_respuesta, modelo = p_modelo, version_prompt = p_version,
         tokens_entrada = coalesce((p_tokens->>'entrada')::integer, 0),
         tokens_salida = coalesce((p_tokens->>'salida')::integer, 0),
         tokens_cacheados = coalesce((p_tokens->>'cacheados')::integer, 0),
         tokens_razonamiento = coalesce((p_tokens->>'razonamiento')::integer, 0),
         costo_usd = p_costo, respondido_en = now()
   where id = p_turno;

  update public.conversaciones
     set turnos = turnos + 1, costo_usd = costo_usd + p_costo, actualizado_en = now()
   where id = v.conversacion_id;

  return jsonb_build_object('turnoId', p_turno, 'turno', v.turno);
end;
$$;

create function public.fallar_turno(
  p_turno uuid, p_error text, p_costo numeric default 0, p_tokens jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v public.turnos_conversacion;
begin
  select * into v from public.turnos_conversacion where id = p_turno for update;
  if not found or v.estado <> 'pendiente' then
    return;
  end if;

  update public.turnos_conversacion
     set estado = 'error', error = left(coalesce(p_error, 'error'), 500),
         tokens_entrada = coalesce((p_tokens->>'entrada')::integer, 0),
         tokens_salida = coalesce((p_tokens->>'salida')::integer, 0),
         tokens_cacheados = coalesce((p_tokens->>'cacheados')::integer, 0),
         tokens_razonamiento = coalesce((p_tokens->>'razonamiento')::integer, 0),
         costo_usd = greatest(coalesce(p_costo, 0), 0), respondido_en = now()
   where id = p_turno;

  update public.conversaciones
     set costo_usd = costo_usd + greatest(coalesce(p_costo, 0), 0), actualizado_en = now()
   where id = v.conversacion_id;
end;
$$;

revoke all on function public.abrir_turno(uuid, text, uuid, text, uuid, numeric, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.abrir_turno(uuid, text, uuid, text, uuid, numeric, integer, numeric, numeric) to service_role;
revoke all on function public.cerrar_turno(uuid, jsonb, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.cerrar_turno(uuid, jsonb, text, text, jsonb, numeric) to service_role;
revoke all on function public.fallar_turno(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.fallar_turno(uuid, text, numeric, jsonb) to service_role;

-- BAJADA (manual, solo si hay que deshacer; no puede haber generaciones de cambio):
-- drop function public.fallar_turno(uuid, text, numeric, jsonb);
-- drop function public.cerrar_turno(uuid, jsonb, text, text, jsonb, numeric);
-- drop function public.abrir_turno(uuid, text, uuid, text, uuid, numeric, integer, numeric, numeric);
-- drop table public.turnos_conversacion;
-- drop table public.conversaciones;
-- drop index public.generaciones_base_creativo_id_idx;
-- alter table public.generaciones
--   drop constraint generaciones_ajuste_sin_referencia,
--   drop constraint generaciones_ajuste_sin_lote,
--   drop constraint generaciones_ajuste_completo,
--   drop column instruccion,
--   drop column base_creativo_id;
