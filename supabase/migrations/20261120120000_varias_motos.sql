-- Varias motos en UNA placa (ADR-041): de 2 a 4 motos, una sola marca. Item (B) de "Placas en lote" (ADR-032).
-- ADITIVA: una columna nullable (las promociones que ya hay quedan en null = una sola moto), tres checks, un trigger y
-- aprobar_promocion con la MISMA firma. Nada de esto lo escribe un cliente (regla #5): lo hace el backend con la clave secreta.
--
-- La moto principal (la 1) sigue en las columnas de siempre (foto_id, modelo, datos); las otras 1 a 3 van acá:
--   [{ "fotoId": uuid, "modelo": text, "precio": { "moneda": "ARS"|"USD", "monto": int }, "promo": { "tipo": text, "detalle": text } }, ...]
-- El servidor valida cada elemento (lib/promocion/varias/validar.ts) antes de insertar; la base defiende lo estructural.

alter table public.promociones
  add column motos_extra jsonb
    check (motos_extra is null or (case when jsonb_typeof(motos_extra) = 'array' then jsonb_array_length(motos_extra) between 1 and 3 else false end and pg_column_size(motos_extra) <= 4096)),
  -- Una placa de varias motos es una promoción suelta: nunca de una tanda ni de un lote.
  add constraint promociones_varias_motos_sueltas check (motos_extra is null or (tanda_id is null and grupo is null and variante is null)),
  -- Solo la copia fiel o la grilla: las demás plantillas llevan UNA moto y UNA escena.
  add constraint promociones_varias_motos_plantilla check (motos_extra is null or plantilla is null or plantilla in ('copia_fiel', 'varias_motos')),
  -- La grilla se arma con las fotos de las motos: sin otras motos no tiene sentido.
  add constraint promociones_grilla_con_varias_motos check (plantilla is distinct from 'varias_motos' or motos_extra is not null);

-- Las motos se fijan al crear: el emparejamiento foto-modelo-precio no se rehace a mano (para otras motos, otra promoción).
create function public.promociones_motos_extra_fija()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.motos_extra is distinct from old.motos_extra then
    raise exception 'Las motos de una placa con varias motos no se cambian' using errcode = 'PT422';
  end if;
  return new;
end;
$$;

create trigger promociones_motos_extra_fija before update of motos_extra on public.promociones
  for each row execute function public.promociones_motos_extra_fija();

revoke all on function public.promociones_motos_extra_fija() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- aprobar_promocion: misma firma. La grilla se aprueba sin escena de IA (sus imágenes son las fotos de las motos) y el snapshot
-- inmutable suma las otras motos. La copia fiel sigue exigiendo su verificación ok, también con varias motos.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.aprobar_promocion(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid)
returns public.aprobaciones_promocion
language plpgsql
set search_path = ''
as $$
declare
  v_promo public.promociones;
  v_apro  public.aprobaciones_promocion;
  v_verificacion uuid;
  v_ver_estado   text;
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
  if (v_promo.escena_creativo_id is null and v_promo.plantilla is distinct from 'varias_motos') or p_placa_ruta is null or p_placa_hash is null then
    raise exception 'Falta la imagen' using errcode = 'PT422';
  end if;

  -- Copia fiel (ADR-040): la imagen lleva los textos ESCRITOS por la IA. Sin una verificación 'ok' de ESA imagen no se aprueba
  -- (defensa en profundidad: el endpoint ya lo chequea). Una verificación posterior que difiere o falló también la deja afuera.
  if v_promo.plantilla = 'copia_fiel' then
    select id, estado into v_verificacion, v_ver_estado
      from public.verificaciones_texto
     where creativo_id = v_promo.escena_creativo_id
     order by creado_en desc
     limit 1;
    if v_verificacion is null or v_ver_estado <> 'ok' then
      raise exception 'Los textos de la imagen no están verificados' using errcode = 'PT422';
    end if;
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
      'referencia_diseno_id', v_promo.referencia_diseno_id,
      'motos_extra', v_promo.motos_extra
    ) || case when v_verificacion is null then '{}'::jsonb else jsonb_build_object('verificacion_id', v_verificacion) end,
    p_placa_ruta,
    p_usuario
  )
  returning * into v_apro;

  return v_apro;
end;
$$;

revoke all on function public.aprobar_promocion(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_promocion(uuid, integer, text, text, uuid) to service_role;

-- BAJADA (manual, solo si no hay promociones con motos_extra):
-- 1) volver aprobar_promocion a la versión de 20261118120000_copia_fiel.sql (create or replace con ese cuerpo).
-- drop trigger promociones_motos_extra_fija on public.promociones;
-- drop function public.promociones_motos_extra_fija();
-- alter table public.promociones drop constraint promociones_grilla_con_varias_motos;
-- alter table public.promociones drop constraint promociones_varias_motos_plantilla;
-- alter table public.promociones drop constraint promociones_varias_motos_sueltas;
-- alter table public.promociones drop column motos_extra;
