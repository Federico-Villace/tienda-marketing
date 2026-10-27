-- Placa personalizable (ADR-030). Pedido de Julián: describir el fondo, elegir dónde van la moto y
-- el texto, escribir una línea propia y adjuntar una foto de inspiración.
-- ADITIVA: columnas nuevas con default y dos funciones que se reemplazan con la MISMA firma.
-- Nada de esto lo escribe un cliente (regla #5): lo hace el backend con la clave secreta.

-- La foto de inspiración se sube por el mismo camino que la de la moto (compresión en el navegador,
-- JPEG, declaración de derechos registrada). Esta columna las distingue; las que ya hay son de moto.
alter table public.fotos
  add column uso text not null default 'moto' check (uso in ('moto', 'inspiracion'));

alter table public.promociones
  add column fondo_descripcion text check (char_length(fondo_descripcion) <= 300),
  add column posicion_moto text not null default 'centro' check (posicion_moto in ('izquierda', 'centro', 'derecha')),
  add column linea_extra text check (char_length(linea_extra) <= 60),
  add column inspiracion_foto_id uuid references public.fotos(id) on delete set null,
  -- Con el texto al costado el lado sale de la moto: al centro no hay lado (la app lo valida; esto lo defiende).
  add constraint promociones_costado_sin_moto_al_centro check (plantilla is null or right(plantilla, 8) <> '_costado' or posicion_moto <> 'centro');

-- La escena queda atada a la foto de referencia con la que se generó (se descarga al confirmar).
alter table public.generaciones
  add column referencia_foto_id uuid references public.fotos(id) on delete restrict,
  add constraint generaciones_referencia_con_foto check (referencia_foto_id is null or foto_id is not null);

-- ═══════════════════════════════════════════════════════════════
-- editar_promocion: misma firma, la lista blanca suma los cuatro campos nuevos.
-- La línea extra y la posición de la moto cambian lo que se dibuja (invalidan la placa).
-- La descripción del fondo y la inspiración solo cambian la PRÓXIMA escena: no tocan la que ya hay.
-- ═══════════════════════════════════════════════════════════════

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
    'fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id'
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

  return v_nueva;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- aprobar_promocion: misma firma, el snapshot inmutable suma lo nuevo
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
      'inspiracion_foto_id', v_promo.inspiracion_foto_id
    ),
    p_placa_ruta,
    p_usuario
  )
  returning * into v_apro;

  return v_apro;
end;
$$;

revoke all on function public.editar_promocion(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.editar_promocion(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.aprobar_promocion(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_promocion(uuid, integer, text, text, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer; antes hay que volver a las funciones de 20261029120000_promociones.sql):
-- alter table public.generaciones drop constraint generaciones_referencia_con_foto, drop column referencia_foto_id;
-- alter table public.promociones drop column inspiracion_foto_id, drop column linea_extra, drop column posicion_moto, drop column fondo_descripcion;
-- alter table public.fotos drop column uso;
