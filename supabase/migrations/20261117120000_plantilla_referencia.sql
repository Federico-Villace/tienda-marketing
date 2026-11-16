-- Plantilla desde la referencia (ADR-039): la placa copia el layout, los colores y el estilo de letra de la foto de
-- inspiración. Un modelo de visión LEE la foto y devuelve un JSON sin texto libre; el servidor lo valida y lo repara
-- y se guarda acá, inmutable, para no volver a cobrar la misma lectura.
--
-- ADITIVA: una tabla, una columna, dos checks y cuatro funciones (dos nuevas y tres existentes con la MISMA firma).
-- · `referencias_diseno` es una caché por (organización, sha256 de la foto, modelo, versión del prompt). El modelo es un DATO
--   (columna de texto, sin check contra una lista de ids): cambiar de modelo no necesita migración, solo lee de nuevo.
-- · La lectura cuesta plata: `reservar_lectura_referencia` es su compuerta (caché sin cargo, tope mensual, una sola en vuelo)
--   y `gasto_generaciones_mes` suma las lecturas, así el tope mensual cubre imágenes, videos y lecturas.
-- · Nada de esto lo escribe un cliente (regla #5): las funciones solo las ejecuta service_role y la tabla solo tiene lectura.
-- · `crudo` guarda la respuesta original del modelo para auditar (≤ 8 KB). Ninguna columna guarda tokens ni claves (regla #4).

-- ═══════════════════════════════════════════════════════════════
-- referencias_diseno
-- ═══════════════════════════════════════════════════════════════

create table public.referencias_diseno (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references public.organizaciones(id) on delete cascade,
  foto_id             uuid not null references public.fotos(id) on delete restrict,
  -- sha256 (hex) de los bytes de la foto: dos fotos iguales comparten lectura.
  sha256              text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Qué modelo leyó (dato, no constraint) y con qué versión del prompt y de la reparación.
  modelo              text not null check (char_length(modelo) between 1 and 80),
  version_prompt      text not null check (char_length(version_prompt) between 1 and 60),
  version_reparacion  text not null check (char_length(version_reparacion) between 1 and 60),
  estado              text not null check (estado in ('pendiente', 'lista', 'inutilizable', 'error')),
  -- La respuesta original del modelo (auditoría) y la plantilla ya validada y reparada que dibuja la placa.
  crudo               jsonb check (crudo is null or (jsonb_typeof(crudo) = 'object' and pg_column_size(crudo) <= 8192)),
  plantilla           jsonb check (plantilla is null or (jsonb_typeof(plantilla) = 'object' and pg_column_size(plantilla) <= 4096)),
  -- Si la lectura no sirvió: a qué plantilla de siempre se cae.
  fallback            text check (fallback is null or fallback in ('impactante_textura', 'deportiva', 'editorial')),
  avisos              text[] not null default '{}',
  costo_estimado_usd  numeric(10,6) not null check (costo_estimado_usd > 0),
  costo_real_usd      numeric(10,6) check (costo_real_usd is null or costo_real_usd >= 0),
  tokens_entrada      integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_salida       integer check (tokens_salida is null or tokens_salida >= 0),
  error               text check (error is null or char_length(error) <= 500),
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now(),
  terminado_en        timestamptz,
  -- Cada estado trae lo que le corresponde.
  check (estado <> 'lista' or (plantilla is not null and fallback is null)),
  check (estado <> 'inutilizable' or (plantilla is null and fallback is not null)),
  check (estado <> 'pendiente' or (costo_real_usd is null and terminado_en is null))
);

-- Una sola lectura viva por foto, modelo y versión del prompt (las que fallaron no cuentan: se puede reintentar).
create unique index referencias_diseno_unica
  on public.referencias_diseno (organizacion_id, sha256, modelo, version_prompt)
  where estado in ('pendiente', 'lista', 'inutilizable');

create index referencias_diseno_mes on public.referencias_diseno (organizacion_id, creado_en desc);
create index referencias_diseno_foto on public.referencias_diseno (foto_id);

alter table public.referencias_diseno enable row level security;
create policy "lectura por pertenencia" on public.referencias_diseno
  for select using (public.es_miembro(organizacion_id));
-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

-- ═══════════════════════════════════════════════════════════════
-- promociones: de qué lectura sale su plantilla 'referencia'
-- ═══════════════════════════════════════════════════════════════

alter table public.promociones
  add column referencia_diseno_id uuid references public.referencias_diseno(id) on delete restrict,
  -- La plantilla 'referencia' siempre apunta a su lectura.
  add constraint promociones_referencia_con_lectura check (plantilla is distinct from 'referencia' or referencia_diseno_id is not null);

create index on public.promociones (referencia_diseno_id) where referencia_diseno_id is not null;

-- Las de diseño llevan la moto al centro: ahora son cuatro.
alter table public.promociones drop constraint promociones_diseno_moto_al_centro;
alter table public.promociones
  add constraint promociones_diseno_moto_al_centro check (plantilla is null or plantilla not in ('impactante_textura', 'deportiva', 'editorial', 'referencia') or posicion_moto = 'centro');

-- ═══════════════════════════════════════════════════════════════
-- gasto_generaciones_mes: misma firma, suma también las lecturas de referencia
-- ═══════════════════════════════════════════════════════════════

create or replace function public.gasto_generaciones_mes(p_org uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
    -- Lo de siempre, sin tocar: las generaciones de imagen y video confirmadas del mes.
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
  ) + (
    -- Las lecturas de referencia del mes: pendiente = lo estimado; cerrada = lo real (o, si no se supo, lo estimado).
    -- Sin lecturas esta suma es 0 y la función devuelve exactamente lo de antes.
    select coalesce(sum(
      case
        when r.estado = 'pendiente' then r.costo_estimado_usd
        else coalesce(r.costo_real_usd, r.costo_estimado_usd)
      end
    ), 0)
    from public.referencias_diseno r
    where r.organizacion_id = p_org
      and r.creado_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- La compuerta de la lectura: reservar (antes de llamar al modelo) y cerrar (después)
-- ═══════════════════════════════════════════════════════════════

-- Devuelve la lectura que ya existe (lista o inutilizable: SIN cargo) o crea una pendiente (la que hay que cobrar).
-- 22023 parámetros inválidos · PT404 la foto no es de la organización · PT409 ya se está leyendo · PT402 supera el tope mensual.
create function public.reservar_lectura_referencia(
  p_org uuid, p_foto uuid, p_sha text, p_modelo text, p_version text, p_version_reparacion text, p_estimado numeric, p_tope numeric, p_usuario uuid
)
returns public.referencias_diseno
language plpgsql
set search_path = ''
as $$
declare
  v         public.referencias_diseno;
  v_gastado numeric;
begin
  if p_tope is null or p_tope <= 0 then
    raise exception 'El tope mensual no es válido' using errcode = '22023';
  end if;
  if p_estimado is null or p_estimado <= 0 then
    raise exception 'El costo estimado no es válido' using errcode = '22023';
  end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'El hash de la foto no es válido' using errcode = '22023';
  end if;
  if p_modelo is null or char_length(p_modelo) not between 1 and 80
     or p_version is null or char_length(p_version) not between 1 and 60
     or p_version_reparacion is null or char_length(p_version_reparacion) not between 1 and 60 then
    raise exception 'Faltan el modelo o las versiones' using errcode = '22023';
  end if;

  if not exists (select 1 from public.fotos where id = p_foto and organizacion_id = p_org and borrada_en is null) then
    raise exception 'La foto no existe' using errcode = 'PT404';
  end if;

  -- Serializa todo lo que cuesta de la organización (mismo candado que confirmar_generacion): el gasto que se lee
  -- abajo ya incluye lo que ganó antes, y dos clics a la vez no cobran dos veces la misma lectura.
  perform 1 from public.organizaciones where id = p_org for update;

  select * into v from public.referencias_diseno
   where organizacion_id = p_org and sha256 = p_sha and modelo = p_modelo and version_prompt = p_version
     and estado in ('lista', 'inutilizable')
   limit 1;
  if found then
    return v;
  end if;

  select * into v from public.referencias_diseno
   where organizacion_id = p_org and sha256 = p_sha and modelo = p_modelo and version_prompt = p_version
     and estado = 'pendiente'
   limit 1;
  if found then
    if v.creado_en > now() - interval '120 seconds' then
      raise exception 'Ya se está leyendo esta referencia' using errcode = 'PT409';
    end if;
    -- Una lectura que quedó colgada: se marca como error (su estimado sigue contando en el gasto, por prudencia).
    update public.referencias_diseno
       set estado = 'error', error = 'La lectura anterior no terminó', terminado_en = now()
     where id = v.id;
  end if;

  v_gastado := public.gasto_generaciones_mes(p_org);
  if v_gastado + p_estimado > p_tope then
    raise exception 'Supera el tope mensual' using errcode = 'PT402';
  end if;

  insert into public.referencias_diseno (organizacion_id, foto_id, sha256, modelo, version_prompt, version_reparacion, estado, costo_estimado_usd, creado_por)
  values (p_org, p_foto, p_sha, p_modelo, p_version, p_version_reparacion, 'pendiente', p_estimado, p_usuario)
  returning * into v;

  return v;
end;
$$;

-- Cierra una lectura pendiente con lo que pasó. Siempre con el costo real (nunca null: si no se supo, el tope).
-- 22023 parámetros inválidos · PT404 no existe · PT409 ya estaba cerrada.
create function public.cerrar_lectura_referencia(
  p_id uuid, p_estado text, p_crudo jsonb, p_plantilla jsonb, p_fallback text, p_avisos text[], p_costo numeric, p_tokens_entrada integer, p_tokens_salida integer, p_error text
)
returns public.referencias_diseno
language plpgsql
set search_path = ''
as $$
declare
  v public.referencias_diseno;
begin
  if p_estado is null or p_estado not in ('lista', 'inutilizable', 'error') then
    raise exception 'El estado de cierre no es válido' using errcode = '22023';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'El costo real no es válido' using errcode = '22023';
  end if;

  select * into v from public.referencias_diseno where id = p_id for update;
  if not found then
    raise exception 'La lectura no existe' using errcode = 'PT404';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'La lectura ya estaba cerrada' using errcode = 'PT409';
  end if;

  update public.referencias_diseno
     set estado         = p_estado,
         crudo          = p_crudo,
         plantilla      = case when p_estado = 'lista' then p_plantilla else null end,
         fallback       = case when p_estado = 'inutilizable' then p_fallback else null end,
         avisos         = coalesce(p_avisos, '{}'),
         costo_real_usd = p_costo,
         tokens_entrada = p_tokens_entrada,
         tokens_salida  = p_tokens_salida,
         error          = left(p_error, 500),
         terminado_en   = now()
   where id = p_id
  returning * into v;

  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- editar_promocion: misma firma, la lista blanca suma referencia_diseno_id
-- ═══════════════════════════════════════════════════════════════
-- Cambiar de lectura invalida la placa (no la escena: eso lo decide el endpoint con la escena v6). Solo la escribe el
-- endpoint de lectura: NO está en CAMPOS de cambios.ts, así un cliente no puede apuntar su promoción a una lectura ajena.

create or replace function public.editar_promocion(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid)
returns public.promociones
language plpgsql
set search_path = ''
as $$
declare
  v_permitidas constant text[] := array[
    'marca_id', 'modelo', 'datos', 'foto_id', 'aspecto', 'plantilla', 'fondo',
    'analisis_id', 'textos_id', 'copy', 'copy_opcion', 'copy_editado', 'titular',
    'escena_creativo_id', 'placa_ruta', 'placa_hash',
    'fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id',
    'diseno', 'inspiracion_modo', 'referencia_diseno_id'
  ];
  v_clave           text;
  v_ant             public.promociones;
  v_nueva           public.promociones;
  v_cambia_escena   boolean;
  v_cambia_placa    boolean;
begin
  if jsonb_typeof(p_campos) is distinct from 'object' then
    raise exception 'Los campos deben ser un objeto' using errcode = '22023';
  end if;

  select k into v_clave from jsonb_object_keys(p_campos) as k where k <> all (v_permitidas) limit 1;
  if found then
    raise exception 'Campo no editable: %', v_clave using errcode = '22023';
  end if;

  select * into v_ant from public.promociones where id = p_id for update;
  if not found then
    raise exception 'La promoción no existe' using errcode = 'PT404';
  end if;
  if v_ant.estado <> 'borrador' then
    raise exception 'Ya no es un borrador' using errcode = 'PT409';
  end if;
  if v_ant.revision <> p_revision then
    raise exception 'Esta promoción cambió: recargá' using errcode = 'PT409';
  end if;

  -- La lectura de la referencia tiene que existir, ser de la misma organización y estar cerrada (nunca una pendiente ni con error).
  if p_campos ? 'referencia_diseno_id' and p_campos->>'referencia_diseno_id' is not null then
    if not exists (
      select 1 from public.referencias_diseno r
       where r.id = (p_campos->>'referencia_diseno_id')::uuid
         and r.organizacion_id = v_ant.organizacion_id
         and r.estado in ('lista', 'inutilizable')
    ) then
      raise exception 'La referencia no existe' using errcode = 'PT422';
    end if;
  end if;

  -- Otra foto o otro formato invalidan la escena (tiene otra proporción o es de otra foto),
  -- salvo que el mismo pedido traiga la escena nueva.
  v_cambia_escena := not (p_campos ? 'escena_creativo_id') and (
       (p_campos ? 'aspecto' and p_campos->>'aspecto' is distinct from v_ant.aspecto)
    or (p_campos ? 'foto_id' and p_campos->>'foto_id' is distinct from v_ant.foto_id::text)
  );

  -- La placa final depende de estos campos: si cambia alguno, la anterior ya no vale.
  v_cambia_placa := v_cambia_escena
    or (p_campos ? 'datos' and p_campos->'datos' is distinct from v_ant.datos)
    or (p_campos ? 'modelo' and p_campos->>'modelo' is distinct from v_ant.modelo)
    or (p_campos ? 'marca_id' and p_campos->>'marca_id' is distinct from v_ant.marca_id)
    or (p_campos ? 'plantilla' and p_campos->>'plantilla' is distinct from v_ant.plantilla)
    or (p_campos ? 'titular' and p_campos->>'titular' is distinct from v_ant.titular)
    or (p_campos ? 'linea_extra' and p_campos->>'linea_extra' is distinct from v_ant.linea_extra)
    or (p_campos ? 'posicion_moto' and p_campos->>'posicion_moto' is distinct from v_ant.posicion_moto)
    or (p_campos ? 'diseno' and nullif(p_campos->'diseno', 'null'::jsonb) is distinct from v_ant.diseno)
    or (p_campos ? 'referencia_diseno_id' and p_campos->>'referencia_diseno_id' is distinct from v_ant.referencia_diseno_id::text)
    or (p_campos ? 'aspecto' and p_campos->>'aspecto' is distinct from v_ant.aspecto)
    or (p_campos ? 'escena_creativo_id' and p_campos->>'escena_creativo_id' is distinct from v_ant.escena_creativo_id::text);

  update public.promociones set
    marca_id           = case when p_campos ? 'marca_id' then p_campos->>'marca_id' else marca_id end,
    modelo             = case when p_campos ? 'modelo' then p_campos->>'modelo' else modelo end,
    datos              = case when p_campos ? 'datos' then p_campos->'datos' else datos end,
    foto_id            = case when p_campos ? 'foto_id' then (p_campos->>'foto_id')::uuid else foto_id end,
    aspecto            = case when p_campos ? 'aspecto' then p_campos->>'aspecto' else aspecto end,
    plantilla          = case when p_campos ? 'plantilla' then p_campos->>'plantilla' else plantilla end,
    fondo              = case when p_campos ? 'fondo' then p_campos->>'fondo' else fondo end,
    analisis_id        = case when p_campos ? 'analisis_id' then (p_campos->>'analisis_id')::uuid else analisis_id end,
    textos_id          = case when p_campos ? 'textos_id' then (p_campos->>'textos_id')::uuid else textos_id end,
    copy               = case when p_campos ? 'copy' then nullif(p_campos->'copy', 'null'::jsonb) else copy end,
    copy_opcion        = case when p_campos ? 'copy_opcion' then (p_campos->>'copy_opcion')::smallint else copy_opcion end,
    copy_editado       = case when p_campos ? 'copy_editado' then (p_campos->>'copy_editado')::boolean else copy_editado end,
    titular            = case when p_campos ? 'titular' then p_campos->>'titular' else titular end,
    fondo_descripcion  = case when p_campos ? 'fondo_descripcion' then p_campos->>'fondo_descripcion' else fondo_descripcion end,
    posicion_moto      = case when p_campos ? 'posicion_moto' then p_campos->>'posicion_moto' else posicion_moto end,
    linea_extra        = case when p_campos ? 'linea_extra' then p_campos->>'linea_extra' else linea_extra end,
    inspiracion_foto_id = case when p_campos ? 'inspiracion_foto_id' then (p_campos->>'inspiracion_foto_id')::uuid else inspiracion_foto_id end,
    diseno             = case when p_campos ? 'diseno' then nullif(p_campos->'diseno', 'null'::jsonb) else diseno end,
    inspiracion_modo   = case when p_campos ? 'inspiracion_modo' then p_campos->>'inspiracion_modo' else inspiracion_modo end,
    referencia_diseno_id = case when p_campos ? 'referencia_diseno_id' then (p_campos->>'referencia_diseno_id')::uuid else referencia_diseno_id end,
    escena_creativo_id = case
      when p_campos ? 'escena_creativo_id' then (p_campos->>'escena_creativo_id')::uuid
      when v_cambia_escena then null
      else escena_creativo_id end,
    placa_ruta         = case
      when p_campos ? 'placa_ruta' then p_campos->>'placa_ruta'
      when v_cambia_placa and not (p_campos ? 'placa_hash') then null
      else placa_ruta end,
    placa_hash         = case
      when p_campos ? 'placa_hash' then p_campos->>'placa_hash'
      when v_cambia_placa and not (p_campos ? 'placa_ruta') then null
      else placa_hash end,
    revision           = revision + 1,
    actualizado_por    = p_usuario,
    actualizado_en     = now()
  where id = p_id
  returning * into v_nueva;

  -- Dibujar con la plantilla de la referencia exige una lectura LISTA (no una inutilizable: esa cae a una plantilla de siempre).
  if v_nueva.plantilla = 'referencia' and not exists (
    select 1 from public.referencias_diseno r where r.id = v_nueva.referencia_diseno_id and r.estado = 'lista'
  ) then
    raise exception 'La plantilla de la referencia necesita una lectura lista' using errcode = 'PT422';
  end if;

  return v_nueva;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- aprobar_promocion: misma firma, el snapshot inmutable suma referencia_diseno_id
-- ═══════════════════════════════════════════════════════════════

create or replace function public.aprobar_promocion(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid)
returns public.aprobaciones_promocion
language plpgsql
set search_path = ''
as $$
declare
  v_promo public.promociones;
  v_apro  public.aprobaciones_promocion;
begin
  select * into v_promo from public.promociones where id = p_id for update;
  if not found then
    raise exception 'La promoción no existe' using errcode = 'PT404';
  end if;
  if v_promo.estado <> 'borrador' then
    raise exception 'Ya no es un borrador' using errcode = 'PT409';
  end if;
  if v_promo.revision <> p_revision then
    raise exception 'Esta promoción cambió: recargá' using errcode = 'PT409';
  end if;
  if v_promo.copy is null then
    raise exception 'Falta elegir el texto' using errcode = 'PT422';
  end if;
  if v_promo.escena_creativo_id is null or p_placa_ruta is null or p_placa_hash is null then
    raise exception 'Falta la imagen' using errcode = 'PT422';
  end if;

  update public.promociones
     set estado = 'aprobada',
         placa_ruta = p_placa_ruta,
         placa_hash = p_placa_hash,
         revision = revision + 1,
         actualizado_por = p_usuario,
         actualizado_en = now()
   where id = p_id;

  -- El snapshot sale de la fila bloqueada, jamás del cliente.
  insert into public.aprobaciones_promocion (organizacion_id, promocion_id, version, snapshot, placa_ruta, aprobado_por)
  values (
    v_promo.organizacion_id,
    p_id,
    (select coalesce(max(version), 0) + 1 from public.aprobaciones_promocion where promocion_id = p_id),
    jsonb_build_object(
      'marca_id', v_promo.marca_id,
      'modelo', v_promo.modelo,
      'datos', v_promo.datos,
      'aspecto', v_promo.aspecto,
      'plantilla', v_promo.plantilla,
      'fondo', v_promo.fondo,
      'titular', v_promo.titular,
      'copy', v_promo.copy,
      'copy_editado', v_promo.copy_editado,
      'analisis_id', v_promo.analisis_id,
      'textos_id', v_promo.textos_id,
      'escena_creativo_id', v_promo.escena_creativo_id,
      'fondo_descripcion', v_promo.fondo_descripcion,
      'posicion_moto', v_promo.posicion_moto,
      'linea_extra', v_promo.linea_extra,
      'inspiracion_foto_id', v_promo.inspiracion_foto_id,
      'diseno', v_promo.diseno,
      'inspiracion_modo', v_promo.inspiracion_modo,
      'referencia_diseno_id', v_promo.referencia_diseno_id
    ),
    p_placa_ruta,
    p_usuario
  )
  returning * into v_apro;

  return v_apro;
end;
$$;

revoke all on function public.gasto_generaciones_mes(uuid) from public, anon, authenticated;
grant execute on function public.gasto_generaciones_mes(uuid) to service_role;
revoke all on function public.reservar_lectura_referencia(uuid, uuid, text, text, text, text, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.reservar_lectura_referencia(uuid, uuid, text, text, text, text, numeric, numeric, uuid) to service_role;
revoke all on function public.cerrar_lectura_referencia(uuid, text, jsonb, jsonb, text, text[], numeric, integer, integer, text) from public, anon, authenticated;
grant execute on function public.cerrar_lectura_referencia(uuid, text, jsonb, jsonb, text, text[], numeric, integer, integer, text) to service_role;
revoke all on function public.editar_promocion(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.editar_promocion(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.aprobar_promocion(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_promocion(uuid, integer, text, text, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer; antes hay que volver a las funciones de 20261110120000_plantillas_diseno.sql
-- (editar_promocion, aprobar_promocion) y de 20261026120000_productor.sql (gasto_generaciones_mes), y ninguna promoción
-- puede tener plantilla 'referencia'):
-- drop function public.cerrar_lectura_referencia(uuid, text, jsonb, jsonb, text, text[], numeric, integer, integer, text);
-- drop function public.reservar_lectura_referencia(uuid, uuid, text, text, text, text, numeric, numeric, uuid);
-- alter table public.promociones drop constraint promociones_diseno_moto_al_centro;
-- alter table public.promociones add constraint promociones_diseno_moto_al_centro check (plantilla is null or plantilla not in ('impactante_textura', 'deportiva', 'editorial') or posicion_moto = 'centro');
-- alter table public.promociones drop constraint promociones_referencia_con_lectura, drop column referencia_diseno_id;
-- drop table public.referencias_diseno;
