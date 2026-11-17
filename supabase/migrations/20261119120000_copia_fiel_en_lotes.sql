-- Copia fiel en las tandas (addendum de ADR-040): una tanda de marcas, un lote de motos y un lote de textos pueden usar la copia fiel.
--
-- ADITIVA: saca UN check de `generaciones` y reemplaza UNA función con la MISMA firma. No agrega tablas ni columnas.
--
-- · La migración de la copia fiel (20261118120000) prohibía una generación con textos esperados dentro de un lote
--   (`generaciones_copia_sin_lote`). Ahora una tanda confirma el total de sus imágenes de una vez (la compuerta de lote de ADR-032):
--   UNA generación por cada juego de textos distinto, todas dentro de un lote. Sin ese check el lote las acepta.
--   `generaciones_copia_completa` (las tres columnas van juntas o ninguna) SIGUE VIGENTE.
-- · `crear_lote_generacion` (misma firma) guarda de cada ítem sus `textos_esperados`, su `textos_hash` y su `modelo_verificacion`, y
--   devuelve el hash de cada ítem: varias generaciones de la misma tanda y del mismo grupo no se distinguen por el orden de las filas
--   (el id es aleatorio), así que el backend las reconoce por su hash.
-- · El estimado de cada ítem ya incluye la revisión de sus textos (lo arma el backend: imágenes + revisión de cada variante):
--   `confirmar_lote_generacion` suma esos estimados y chequea el tope mensual UNA vez sobre el total, como siempre. No cambia.
-- · Ningún cliente escribe (regla #5): la función solo la ejecuta service_role. Nada guarda tokens ni claves (regla #4).

alter table public.generaciones
  drop constraint generaciones_copia_sin_lote;

-- ═══════════════════════════════════════════════════════════════
-- crear_lote_generacion: el lote 'estimado' y sus N generaciones 'estimada' (ahora también de copia fiel)
-- ═══════════════════════════════════════════════════════════════
-- · p_items: array de { motor, prompt, parametros, cantidad, aspecto, fotoId, referenciaFotoId?, grupo?, versionPrompt,
--   costoEstimadoUsd, textosEsperados?, textosHash?, modeloVerificacion? }. Los tres últimos van juntos (los exige
--   `generaciones_copia_completa`) y solo los pide la copia fiel.
-- · Va a una tanda O a una promoción, nunca a las dos.

create or replace function public.crear_lote_generacion(
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
    tanda_id, promocion_id, grupo, lote_id, creado_por, version_prompt, costo_estimado_usd, vence_en,
    textos_esperados, textos_hash, modelo_verificacion
  )
    select p_org, 'imagen', i->>'motor', i->>'prompt', coalesce(i->'parametros', '{}'::jsonb), (i->>'cantidad')::integer,
           i->>'aspecto', (i->>'fotoId')::uuid, 'promocion', (i->>'referenciaFotoId')::uuid,
           p_tanda, p_promocion, (i->>'grupo')::smallint, v_lote, p_usuario, i->>'versionPrompt',
           (i->>'costoEstimadoUsd')::numeric, p_vence,
           i->'textosEsperados', i->>'textosHash', i->>'modeloVerificacion'
      from jsonb_array_elements(p_items) with ordinality as t(i, n)
     order by t.n;

  return jsonb_build_object(
    'loteId', v_lote,
    'items', (
      select jsonb_agg(jsonb_build_object('generacionId', g.id, 'grupo', g.grupo, 'costoEstimadoUsd', g.costo_estimado_usd, 'textosHash', g.textos_hash) order by g.grupo nulls first, g.creado_en, g.id)
        from public.generaciones g where g.lote_id = v_lote
    )
  );
end
$$;

revoke all on function public.crear_lote_generacion(uuid, uuid, uuid, jsonb, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.crear_lote_generacion(uuid, uuid, uuid, jsonb, timestamptz, uuid) to service_role;

-- BAJADA (manual; solo si no hay generaciones de copia fiel dentro de un lote):
-- 1) volver a correr el create or replace de crear_lote_generacion de 20261101120000_placas_en_lote.sql (sin las tres columnas nuevas).
-- alter table public.generaciones add constraint generaciones_copia_sin_lote check (lote_id is null or textos_esperados is null);
