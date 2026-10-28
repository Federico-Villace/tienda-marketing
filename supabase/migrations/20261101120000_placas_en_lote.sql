-- Placas en lote (ADR-032): varias motos con el mismo diseño (tipo 'motos'), varios textos
-- sobre una escena (tipo 'textos') y una compuerta de costo para N escenas a la vez.
--
-- · A y C generalizan la tanda de ADR-028 en vez de inventar una entidad nueva: la hija sigue
--   siendo una `promociones` normal (revisión, aprobar/reabrir/descartar, snapshot, placa,
--   textos). `tandas_promocion.tipo` dice qué es; `promociones.grupo` es la moto (1..10) y
--   `promociones.variante` el texto (1..5).
-- · La unicidad pasa de (tanda, marca) a (tanda, grupo, variante, marca): una misma marca
--   puede repetirse en la tanda si es otra moto u otro texto. Las filas viejas (grupo y
--   variante null) mantienen exactamente la garantía de antes.
-- · LA COMPUERTA DE LOTE (regla dura #3): `lotes_generacion` agrupa N generaciones
--   'estimada'. `confirmar_lote_generacion` las pasa a 'confirmada' TODAS o NINGUNA, con un
--   solo chequeo del tope mensual sobre el TOTAL (PT402 sin confirmar ninguna). La ejecución
--   es aparte (`iniciar_generacion_lote`: confirmada → corriendo, PT409 evita correr dos
--   veces). Lo confirmado que nunca corrió cuenta en el tope por su estimado hasta que se
--   genera o se libera (`liberar_generaciones_lote`: queda en 'error' con costo real 0).
-- · Un ítem de lote no se confirma suelto: `confirmar_generacion` (misma firma) lo rechaza.
-- · `gasto_generaciones_mes` no cambia: estimadas no cuentan, confirmadas por estimado,
--   terminadas por el real.
-- · Ningún cliente escribe (regla dura #5): las funciones solo las ejecuta service_role.
--   PT402 / PT404 / PT409 / PT410 / 22023 son los códigos que PostgREST traduce a HTTP.
-- · Ninguna columna guarda tokens ni credenciales (regla dura #4).

-- ═══════════════════════════════════════════════════════════════
-- tandas_promocion.tipo y promociones.grupo / variante
-- ═══════════════════════════════════════════════════════════════

alter table public.tandas_promocion
  add column tipo text not null default 'marcas' check (tipo in ('marcas', 'motos', 'textos'));

alter table public.promociones
  add column grupo    smallint check (grupo between 1 and 10),
  add column variante smallint check (variante between 1 and 5),
  add constraint promociones_grupo_variante_con_tanda check ((grupo is null and variante is null) or tanda_id is not null),
  add constraint promociones_grupo_xor_variante check (grupo is null or variante is null);

drop index public.promociones_tanda_marca_unica;

create unique index promociones_tanda_pieza_unica
  on public.promociones (tanda_id, coalesce(grupo, 0), coalesce(variante, 0), marca_id)
  where tanda_id is not null and estado <> 'descartada';

-- ═══════════════════════════════════════════════════════════════
-- lotes_generacion: el grupo de escenas que se confirma junto
-- ═══════════════════════════════════════════════════════════════

create table public.lotes_generacion (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  tanda_id           uuid references public.tandas_promocion(id) on delete set null,
  promocion_id       uuid references public.promociones(id) on delete set null,
  estado             text not null default 'estimado' check (estado in ('estimado', 'confirmado')),
  items              integer not null check (items between 1 and 10),
  costo_estimado_usd numeric(10,6) not null check (costo_estimado_usd >= 0),
  vence_en           timestamptz not null,
  creado_por         uuid references auth.users(id) on delete set null,
  creado_en          timestamptz not null default now(),
  confirmado_por     uuid references auth.users(id) on delete set null,
  confirmado_en      timestamptz,
  check (tanda_id is null or promocion_id is null)
);

create index on public.lotes_generacion (organizacion_id, creado_en desc);

alter table public.lotes_generacion enable row level security;

create policy "lectura por pertenencia" on public.lotes_generacion
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

alter table public.generaciones
  add column grupo   smallint check (grupo between 1 and 10),
  add column lote_id uuid references public.lotes_generacion(id) on delete restrict,
  add constraint generaciones_grupo_con_destino check (grupo is null or tanda_id is not null or promocion_id is not null);

create index on public.generaciones (lote_id) where lote_id is not null;

-- ═══════════════════════════════════════════════════════════════
-- crear_lote_promocion: la tanda y sus hijas, o nada
-- ═══════════════════════════════════════════════════════════════
-- · p_items: array de { fotoId, modelo, datos, titular?, lineaExtra? }.
--   'motos': 2..10 ítems × 1..7 marcas (≤ 14 placas); una hija por (moto, marca), grupo = posición.
--   'textos': 1 marca y 2..5 ítems con la MISMA foto y el MISMO modelo; una hija por texto,
--   variante = posición.
-- · La forma de `datos` la valida el backend (validarPedidoLote); acá se defienden las
--   cardinalidades y las fotos. Las fotos se bloquean para que no se borren entre la
--   validación y el insert.

create function public.crear_lote_promocion(
  p_org uuid, p_tipo text, p_marcas text[], p_items jsonb, p_aspecto text, p_usuario uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tanda uuid;
  v_nm    integer;
  v_ni    integer;
  v_fotos integer;
  v_vivas integer;
begin
  if p_tipo is null or p_tipo not in ('motos', 'textos') then
    raise exception 'El tipo de lote no es válido' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Faltan los ítems del lote' using errcode = '22023';
  end if;

  v_nm := coalesce(array_length(p_marcas, 1), 0);
  v_ni := jsonb_array_length(p_items);
  if v_nm < 1 or v_nm > 7 or (select count(distinct m) from unnest(p_marcas) m) <> v_nm then
    raise exception 'Elegí entre 1 y 7 marcas distintas' using errcode = '22023';
  end if;
  if p_tipo = 'motos' and (v_ni < 2 or v_ni > 10 or v_ni * v_nm > 14) then
    raise exception 'Un lote de motos lleva de 2 a 10 motos y hasta 14 placas' using errcode = '22023';
  end if;
  if p_tipo = 'textos' and (v_nm <> 1 or v_ni < 2 or v_ni > 5) then
    raise exception 'Un lote de textos lleva una marca y de 2 a 5 textos' using errcode = '22023';
  end if;
  if p_tipo = 'textos' and (
       select count(distinct (i->>'fotoId', i->>'modelo')) from jsonb_array_elements(p_items) i
     ) <> 1 then
    raise exception 'Todos los textos son de la misma moto' using errcode = '22023';
  end if;

  -- Cada foto: de la organización, de moto y viva. Se bloquean todas, en orden, para no cruzar locks.
  select count(distinct f.id) into v_vivas from (
    select id from public.fotos
     where id in (select distinct (i->>'fotoId')::uuid from jsonb_array_elements(p_items) i)
       and organizacion_id = p_org and uso = 'moto' and borrada_en is null and ruta is not null
     order by id
       for update
  ) f;
  select count(distinct (i->>'fotoId')::uuid) into v_fotos from jsonb_array_elements(p_items) i;
  if v_vivas <> v_fotos then
    raise exception 'Alguna foto no existe o se borró' using errcode = 'PT404';
  end if;

  insert into public.tandas_promocion (organizacion_id, creado_por, tipo) values (p_org, p_usuario, p_tipo) returning id into v_tanda;

  if p_tipo = 'motos' then
    insert into public.promociones (organizacion_id, tanda_id, grupo, marca_id, modelo, datos, foto_id, aspecto, creado_por, actualizado_por)
      select p_org, v_tanda, it.i::smallint, m.m, it.item->>'modelo', it.item->'datos', (it.item->>'fotoId')::uuid, p_aspecto, p_usuario, p_usuario
        from jsonb_array_elements(p_items) with ordinality as it(item, i)
        cross join unnest(p_marcas) with ordinality as m(m, j)
       order by it.i, m.j;
  else
    insert into public.promociones (organizacion_id, tanda_id, variante, marca_id, modelo, datos, titular, linea_extra, foto_id, aspecto, creado_por, actualizado_por)
      select p_org, v_tanda, it.i::smallint, p_marcas[1], it.item->>'modelo', it.item->'datos',
             it.item->>'titular', nullif(it.item->>'lineaExtra', ''), (it.item->>'fotoId')::uuid, p_aspecto, p_usuario, p_usuario
        from jsonb_array_elements(p_items) with ordinality as it(item, i)
       order by it.i;
  end if;

  return jsonb_build_object(
    'tandaId', v_tanda,
    'promociones', (
      select jsonb_agg(to_jsonb(p) order by coalesce(p.grupo, 0), coalesce(p.variante, 0), array_position(p_marcas, p.marca_id))
        from public.promociones p where p.tanda_id = v_tanda
    )
  );
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- crear_lote_generacion: el lote 'estimado' y sus N generaciones 'estimada'
-- ═══════════════════════════════════════════════════════════════
-- · p_items: array de { motor, prompt, parametros, cantidad, aspecto, fotoId, referenciaFotoId?,
--   grupo?, versionPrompt, costoEstimadoUsd }. El backend arma el prompt y el costo; acá
--   se guarda todo o nada. No gasta nada: solo estima (regla #3).
-- · Va a una tanda O a una promoción, nunca a las dos.

create function public.crear_lote_generacion(
  p_org uuid, p_tanda uuid, p_promocion uuid, p_items jsonb, p_vence timestamptz, p_usuario uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lote  uuid;
  v_ni    integer;
  v_total numeric;
begin
  if (p_tanda is null) = (p_promocion is null) then
    raise exception 'El lote es de una tanda o de una promoción' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Faltan los ítems del lote' using errcode = '22023';
  end if;
  v_ni := jsonb_array_length(p_items);
  if v_ni < 1 or v_ni > 10 then
    raise exception 'Un lote lleva de 1 a 10 imágenes' using errcode = '22023';
  end if;

  if p_tanda is not null then
    perform 1 from public.tandas_promocion where id = p_tanda and organizacion_id = p_org;
  else
    perform 1 from public.promociones where id = p_promocion and organizacion_id = p_org;
  end if;
  if not found then
    raise exception 'La tanda o la promoción no existe' using errcode = 'PT404';
  end if;

  select sum((i->>'costoEstimadoUsd')::numeric) into v_total from jsonb_array_elements(p_items) i;

  insert into public.lotes_generacion (organizacion_id, tanda_id, promocion_id, items, costo_estimado_usd, vence_en, creado_por)
    values (p_org, p_tanda, p_promocion, v_ni, v_total, p_vence, p_usuario)
    returning id into v_lote;

  insert into public.generaciones (
    organizacion_id, tipo, motor, prompt, parametros, cantidad, aspecto, foto_id, edicion, referencia_foto_id,
    tanda_id, promocion_id, grupo, lote_id, creado_por, version_prompt, costo_estimado_usd, vence_en
  )
    select p_org, 'imagen', i->>'motor', i->>'prompt', coalesce(i->'parametros', '{}'::jsonb), (i->>'cantidad')::integer,
           i->>'aspecto', (i->>'fotoId')::uuid, 'promocion', (i->>'referenciaFotoId')::uuid,
           p_tanda, p_promocion, (i->>'grupo')::smallint, v_lote, p_usuario, i->>'versionPrompt',
           (i->>'costoEstimadoUsd')::numeric, p_vence
      from jsonb_array_elements(p_items) with ordinality as t(i, n)
     order by t.n;

  return jsonb_build_object(
    'loteId', v_lote,
    'items', (
      select jsonb_agg(jsonb_build_object('generacionId', g.id, 'grupo', g.grupo, 'costoEstimadoUsd', g.costo_estimado_usd) order by g.grupo nulls first, g.creado_en, g.id)
        from public.generaciones g where g.lote_id = v_lote
    )
  );
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- LA COMPUERTA DE LOTE: N × estimada → N × confirmada, atómica
-- ═══════════════════════════════════════════════════════════════
-- Mismo orden de locks que confirmar_generacion: primero la fila de la organización (serializa
-- todas las confirmaciones: el gasto que se lee ya incluye a las que ganaron antes), después
-- el lote y sus generaciones. El total se RECALCULA de las filas, no de lo que diga el lote.

create function public.confirmar_lote_generacion(p_lote uuid, p_tope numeric, p_usuario uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v         public.lotes_generacion;
  v_n       integer;
  v_total   numeric;
  v_gastado numeric;
begin
  if p_tope is null or p_tope <= 0 then
    raise exception 'El tope mensual no es válido' using errcode = '22023';
  end if;

  select * into v from public.lotes_generacion where id = p_lote;
  if not found then
    raise exception 'El lote no existe' using errcode = 'PT404';
  end if;

  perform 1 from public.organizaciones where id = v.organizacion_id for update;
  select * into v from public.lotes_generacion where id = p_lote for update;

  if v.estado <> 'estimado' then
    raise exception 'Ya se confirmó' using errcode = 'PT409';
  end if;
  if v.vence_en < now() then
    raise exception 'La estimación venció' using errcode = 'PT410';
  end if;

  perform 1 from public.generaciones where lote_id = p_lote for update;
  select count(*), coalesce(sum(costo_estimado_usd), 0) into v_n, v_total
    from public.generaciones where lote_id = p_lote and estado = 'estimada';
  if v_n <> v.items then
    raise exception 'Alguna imagen del lote ya no está para confirmar' using errcode = 'PT409';
  end if;

  v_gastado := public.gasto_generaciones_mes(v.organizacion_id);
  if v_gastado + v_total > p_tope then
    raise exception 'Supera el tope mensual' using errcode = 'PT402';
  end if;

  update public.generaciones
     set estado = 'confirmada', confirmada_por = p_usuario, confirmada_en = now()
   where lote_id = p_lote;
  update public.lotes_generacion
     set estado = 'confirmado', confirmado_por = p_usuario, confirmado_en = now()
   where id = p_lote;

  return jsonb_build_object(
    'loteId', p_lote,
    'generaciones', (
      select jsonb_agg(jsonb_build_object('id', g.id, 'grupo', g.grupo) order by g.grupo nulls first, g.creado_en, g.id)
        from public.generaciones g where g.lote_id = p_lote
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Ejecutar un ítem confirmado: confirmada → corriendo (una sola vez)
-- ═══════════════════════════════════════════════════════════════

create function public.iniciar_generacion_lote(p_id uuid, p_usuario uuid)
returns public.generaciones
language plpgsql
set search_path = ''
as $$
declare
  v public.generaciones;
begin
  select * into v from public.generaciones where id = p_id for update;
  if not found then
    raise exception 'La generación no existe' using errcode = 'PT404';
  end if;
  if v.lote_id is null or v.estado <> 'confirmada' then
    raise exception 'Ya se está generando o ya terminó' using errcode = 'PT409';
  end if;

  update public.generaciones set estado = 'corriendo' where id = p_id returning * into v;
  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Liberar lo confirmado que no se generó: deja de contar en el tope
-- ═══════════════════════════════════════════════════════════════

create function public.liberar_generaciones_lote(p_lote uuid, p_usuario uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform 1 from public.lotes_generacion where id = p_lote;
  if not found then
    raise exception 'El lote no existe' using errcode = 'PT404';
  end if;

  update public.generaciones
     set estado = 'error', costo_real_usd = 0, error = 'Liberada sin generar', terminada_en = now()
   where lote_id = p_lote and estado = 'confirmada';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- confirmar_generacion: un ítem de lote no se confirma suelto
-- ═══════════════════════════════════════════════════════════════
-- Misma firma y mismo retorno que antes (productor.sql), así que alcanza con create or replace.
-- Lo único nuevo es el rechazo de las generaciones con lote_id (PT409).

create or replace function public.confirmar_generacion(p_id uuid, p_tope numeric, p_usuario uuid)
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

  if v.lote_id is not null then
    raise exception 'Es parte de un lote: se confirma con el lote' using errcode = 'PT409';
  end if;
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

revoke all on function public.crear_lote_promocion(uuid, text, text[], jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.crear_lote_promocion(uuid, text, text[], jsonb, text, uuid) to service_role;
revoke all on function public.crear_lote_generacion(uuid, uuid, uuid, jsonb, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.crear_lote_generacion(uuid, uuid, uuid, jsonb, timestamptz, uuid) to service_role;
revoke all on function public.confirmar_lote_generacion(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_lote_generacion(uuid, numeric, uuid) to service_role;
revoke all on function public.iniciar_generacion_lote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.iniciar_generacion_lote(uuid, uuid) to service_role;
revoke all on function public.liberar_generaciones_lote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.liberar_generaciones_lote(uuid, uuid) to service_role;
-- create or replace conserva los grants, pero se repiten por claridad.
revoke all on function public.confirmar_generacion(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.confirmar_generacion(uuid, numeric, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer; no puede haber tandas de motos/textos ni lotes):
-- 1) restaurar confirmar_generacion sin el rechazo de lote_id: volver a correr su create or replace
--    de 20261026120000_productor.sql (sin el `create function`, con `create or replace`).
-- drop function public.liberar_generaciones_lote(uuid, uuid);
-- drop function public.iniciar_generacion_lote(uuid, uuid);
-- drop function public.confirmar_lote_generacion(uuid, numeric, uuid);
-- drop function public.crear_lote_generacion(uuid, uuid, uuid, jsonb, timestamptz, uuid);
-- drop function public.crear_lote_promocion(uuid, text, text[], jsonb, text, uuid);
-- drop index public.generaciones_lote_id_idx;
-- alter table public.generaciones
--   drop constraint generaciones_grupo_con_destino,
--   drop column lote_id,
--   drop column grupo;
-- drop table public.lotes_generacion;
-- drop index public.promociones_tanda_pieza_unica;
-- create unique index promociones_tanda_marca_unica on public.promociones (tanda_id, marca_id)
--   where tanda_id is not null and estado <> 'descartada';
-- alter table public.promociones
--   drop constraint promociones_grupo_xor_variante,
--   drop constraint promociones_grupo_variante_con_tanda,
--   drop column variante,
--   drop column grupo;
-- alter table public.tandas_promocion drop column tipo;
