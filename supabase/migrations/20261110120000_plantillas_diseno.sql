-- Plantillas de diseño (ADR-038): impactante, deportiva y editorial. El decorado lo dibuja la placa
-- (determinístico); la IA solo hace la escena. Lo que la persona ajusta (acento, frase, condición, CTA,
-- tamaños, logo de marca) vive en una columna jsonb que valida el backend, y el modo de la foto de
-- inspiración en otra. ADITIVA: dos columnas, un check y dos funciones con la MISMA firma.
-- Nada de esto lo escribe un cliente (regla #5): lo hace el backend con la clave secreta.

alter table public.promociones
  -- null = todo por defecto. Tope de 2 KB: son unos pocos textos cortos y enteros chicos.
  add column diseno jsonb check (diseno is null or (jsonb_typeof(diseno) = 'object' and pg_column_size(diseno) <= 2048)),
  -- 'ambiente' = tomar solo fondo, luz y paleta de la foto de inspiración (lo de siempre); 'diseno' = emular también
  -- la composición y el tratamiento gráfico, sin ningún texto de ella.
  add column inspiracion_modo text not null default 'ambiente' check (inspiracion_modo in ('ambiente', 'diseno')),
  -- Las de diseño rodean a la moto con un marco: la moto va al centro (la app lo valida; esto lo defiende).
  add constraint promociones_diseno_moto_al_centro check (plantilla is null or plantilla not in ('impactante_textura', 'deportiva', 'editorial') or posicion_moto = 'centro');

-- ═══════════════════════════════════════════════════════════════
-- editar_promocion: misma firma, la lista blanca suma diseno e inspiracion_modo.
-- El diseño cambia lo que se dibuja (invalida la placa) pero NO la escena ni los textos.
-- El modo de la inspiración solo cambia la PRÓXIMA escena: no toca la que ya hay.
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
    'fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id',
    'diseno', 'inspiracion_modo'
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
    or (p_campos ? 'diseno' and nullif(p_campos->'diseno', 'null'::jsonb) is distinct from v_ant.diseno)
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
      'inspiracion_foto_id', v_promo.inspiracion_foto_id,
      'diseno', v_promo.diseno,
      'inspiracion_modo', v_promo.inspiracion_modo
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

-- BAJADA (manual, solo si hay que deshacer; antes hay que volver a las funciones de 20261031120000_placa_personalizable.sql):
-- alter table public.promociones drop constraint promociones_diseno_moto_al_centro, drop column inspiracion_modo, drop column diseno;
