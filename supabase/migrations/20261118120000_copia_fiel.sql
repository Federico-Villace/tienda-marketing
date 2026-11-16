-- Copia fiel de la referencia (ADR-040): la IA de imagen copia el diseño de una placa de referencia con la moto y los datos de la
-- persona y ESCRIBE los textos; un verificador de visión los lee de vuelta (ciego: no recibe lo esperado) y el servidor compara.
-- Una variante con diferencias, o que no se pudo revisar, no se puede usar en la placa ni aprobar.
--
-- ADITIVA: tres columnas y tres checks en `generaciones`, una tabla nueva, un check en `promociones` y cuatro funciones
-- (dos nuevas y dos existentes con la MISMA firma). `promociones.plantilla` es texto libre: el valor 'copia_fiel' no necesita
-- migración. Lo de "sacar textos de la placa" (diseno.ocultos) tampoco: vive en `promociones.diseno` (jsonb de hasta 2 KB) y,
-- para la copia fiel, dentro del snapshot `generaciones.textos_esperados`.
--
-- · `generaciones.textos_esperados` es el snapshot de lo que se le pidió escribir a la IA (incluye lo que la persona sacó); su hash
--   dice si la imagen sigue siendo de los textos actuales. `modelo_verificacion` es un DATO (texto, sin lista de ids).
-- · La verificación inline de una generación (cobro 'generacion') ya está pagada por `confirmar_generacion` (su estimado suma imagen +
--   verificación): NO se suma otra vez al gasto. La re-verificación (cobro 'propio') tiene su propia compuerta, `reservar_verificacion_texto`
--   (tope mensual, una sola en vuelo, sin repetir una ya revisada) y SÍ suma al gasto del mes.
-- · Nada de esto lo escribe un cliente (regla #5): las funciones solo las ejecuta service_role y la tabla solo tiene lectura.
--   Ninguna columna guarda tokens ni claves (regla #4).

-- ═══════════════════════════════════════════════════════════════
-- generaciones: qué textos se le pidieron a la IA y con qué modelo se verifican
-- ═══════════════════════════════════════════════════════════════

alter table public.generaciones
  add column textos_esperados jsonb check (textos_esperados is null or (jsonb_typeof(textos_esperados) = 'object' and pg_column_size(textos_esperados) <= 2048)),
  add column textos_hash text check (textos_hash is null or textos_hash ~ '^[0-9a-f]{64}$'),
  add column modelo_verificacion text check (modelo_verificacion is null or char_length(modelo_verificacion) between 1 and 80),
  -- Las tres van juntas o ninguna.
  add constraint generaciones_copia_completa check ((textos_esperados is null) = (modelo_verificacion is null) and (textos_esperados is null) = (textos_hash is null)),
  -- La copia fiel se genera de a una promoción (o una tanda de marcas), nunca en un lote de motos o de textos.
  add constraint generaciones_copia_sin_lote check (lote_id is null or textos_esperados is null);

-- ═══════════════════════════════════════════════════════════════
-- verificaciones_texto: lo que leyó el verificador de cada imagen y qué dijo la comparación
-- ═══════════════════════════════════════════════════════════════

create table public.verificaciones_texto (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references public.organizaciones(id) on delete cascade,
  creativo_id         uuid not null references public.creativos(id) on delete cascade,
  generacion_id       uuid not null references public.generaciones(id) on delete cascade,
  -- Qué modelo leyó y con qué versión del prompt y de la comparación (datos, no constraints).
  modelo              text not null check (char_length(modelo) between 1 and 80),
  version_prompt      text not null check (char_length(version_prompt) between 1 and 60),
  version_comparacion text not null check (char_length(version_comparacion) between 1 and 60),
  -- Los textos contra los que se comparó (hash del snapshot de la generación).
  textos_hash         text not null check (textos_hash ~ '^[0-9a-f]{64}$'),
  estado              text not null check (estado in ('pendiente', 'ok', 'difiere', 'error')),
  -- 'generacion' = ya pagada por confirmar_generacion (auditoría, NO suma al gasto); 'propio' = re-verificación con su compuerta.
  cobro               text not null check (cobro in ('generacion', 'propio')),
  leido               jsonb check (leido is null or (jsonb_typeof(leido) = 'object' and pg_column_size(leido) <= 6144)),
  diferencias         jsonb not null default '[]' check (jsonb_typeof(diferencias) = 'array' and pg_column_size(diferencias) <= 4096),
  avisos              jsonb not null default '[]' check (jsonb_typeof(avisos) = 'array' and pg_column_size(avisos) <= 4096),
  -- Dónde pegar el logo real y sobre qué fondo (lo vio el verificador); null = arriba al centro.
  zona_logo           jsonb check (zona_logo is null or (jsonb_typeof(zona_logo) = 'object' and pg_column_size(zona_logo) <= 512)),
  fondo_logo          text check (fondo_logo is null or fondo_logo in ('claro', 'oscuro')),
  costo_estimado_usd  numeric(10,6) not null check (costo_estimado_usd > 0),
  costo_real_usd      numeric(10,6) check (costo_real_usd is null or costo_real_usd >= 0),
  tokens_entrada      integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_salida       integer check (tokens_salida is null or tokens_salida >= 0),
  error               text check (error is null or char_length(error) <= 500),
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now(),
  terminado_en        timestamptz,
  -- Cada estado trae lo que le corresponde: 'ok' nunca con diferencias, 'difiere' siempre con alguna.
  check (estado <> 'ok' or jsonb_array_length(diferencias) = 0),
  check (estado <> 'difiere' or jsonb_array_length(diferencias) > 0),
  check (estado <> 'pendiente' or (costo_real_usd is null and terminado_en is null))
);

-- Una sola verificación en vuelo por imagen: el doble click no cobra dos veces.
create unique index verificaciones_texto_una_en_vuelo on public.verificaciones_texto (creativo_id) where estado = 'pendiente';
create index verificaciones_texto_creativo on public.verificaciones_texto (creativo_id, creado_en desc);
create index verificaciones_texto_mes on public.verificaciones_texto (organizacion_id, creado_en desc) where cobro = 'propio';
create index verificaciones_texto_generacion on public.verificaciones_texto (generacion_id);

alter table public.verificaciones_texto enable row level security;
create policy "lectura por pertenencia" on public.verificaciones_texto
  for select using (public.es_miembro(organizacion_id));
-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

-- ═══════════════════════════════════════════════════════════════
-- promociones: la copia fiel siempre lleva su foto de referencia
-- ═══════════════════════════════════════════════════════════════

alter table public.promociones
  add constraint promociones_copia_con_referencia check (plantilla is distinct from 'copia_fiel' or inspiracion_foto_id is not null);

-- ═══════════════════════════════════════════════════════════════
-- gasto_generaciones_mes: misma firma, suma también las re-verificaciones (cobro 'propio')
-- ═══════════════════════════════════════════════════════════════

create or replace function public.gasto_generaciones_mes(p_org uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
begin
  return (
    -- Lo de siempre, sin tocar: las generaciones de imagen y video confirmadas del mes. En la copia fiel su estimado ya incluye la
    -- verificación de cada imagen.
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
    -- Las lecturas de referencia del mes (ADR-039), sin tocar.
    select coalesce(sum(
      case
        when r.estado = 'pendiente' then r.costo_estimado_usd
        else coalesce(r.costo_real_usd, r.costo_estimado_usd)
      end
    ), 0)
    from public.referencias_diseno r
    where r.organizacion_id = p_org
      and r.creado_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'
  ) + (
    -- Las re-verificaciones de texto del mes: pendiente = lo estimado; cerrada = lo real (o, si no se supo, lo estimado).
    -- Las de cobro 'generacion' NO se suman: ya están dentro del costo de su generación. Sin re-verificaciones esta suma es 0.
    select coalesce(sum(
      case
        when v.estado = 'pendiente' then v.costo_estimado_usd
        else coalesce(v.costo_real_usd, v.costo_estimado_usd)
      end
    ), 0)
    from public.verificaciones_texto v
    where v.organizacion_id = p_org
      and v.cobro = 'propio'
      and v.creado_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- La compuerta de la re-verificación: reservar (antes de llamar al modelo) y cerrar (después)
-- ═══════════════════════════════════════════════════════════════

-- Crea la verificación pendiente (la que hay que cobrar) de una imagen de copia fiel.
-- 22023 parámetros inválidos · PT404 el creativo no es de la organización o no tiene imagen · PT422 no es una imagen de copia fiel
-- PT409 ya se revisó (ok o difiere) o ya se está revisando · PT402 supera el tope mensual.
create function public.reservar_verificacion_texto(
  p_org uuid, p_creativo uuid, p_modelo text, p_version text, p_version_comp text, p_estimado numeric, p_tope numeric, p_usuario uuid
)
returns public.verificaciones_texto
language plpgsql
set search_path = ''
as $$
declare
  v_gen     public.generaciones;
  v_ult     public.verificaciones_texto;
  v         public.verificaciones_texto;
  v_gastado numeric;
begin
  if p_tope is null or p_tope <= 0 then
    raise exception 'El tope mensual no es válido' using errcode = '22023';
  end if;
  if p_estimado is null or p_estimado <= 0 then
    raise exception 'El costo estimado no es válido' using errcode = '22023';
  end if;
  if p_modelo is null or char_length(p_modelo) not between 1 and 80
     or p_version is null or char_length(p_version) not between 1 and 60
     or p_version_comp is null or char_length(p_version_comp) not between 1 and 60 then
    raise exception 'Faltan el modelo o las versiones' using errcode = '22023';
  end if;

  select g.* into v_gen
    from public.creativos c
    join public.generaciones g on g.id = c.generacion_id
   where c.id = p_creativo and c.organizacion_id = p_org and c.ruta is not null;
  if not found then
    raise exception 'La imagen no existe' using errcode = 'PT404';
  end if;
  if v_gen.textos_esperados is null then
    raise exception 'Esta imagen no es de una copia fiel' using errcode = 'PT422';
  end if;

  -- Serializa todo lo que cuesta de la organización (mismo candado que confirmar_generacion): el gasto que se lee
  -- abajo ya incluye lo que ganó antes, y dos clics a la vez no cobran dos veces la misma revisión.
  perform 1 from public.organizaciones where id = p_org for update;

  select * into v_ult from public.verificaciones_texto where creativo_id = p_creativo order by creado_en desc limit 1;
  if found then
    if v_ult.estado in ('ok', 'difiere') then
      raise exception 'Esta imagen ya se revisó' using errcode = 'PT409';
    end if;
    if v_ult.estado = 'pendiente' then
      if v_ult.creado_en > now() - interval '120 seconds' then
        raise exception 'Ya se están revisando los textos de esta imagen' using errcode = 'PT409';
      end if;
      -- Una revisión que quedó colgada: se marca como error (su estimado sigue contando en el gasto, por prudencia).
      update public.verificaciones_texto
         set estado = 'error', error = 'La revisión anterior no terminó', terminado_en = now()
       where id = v_ult.id;
    end if;
  end if;

  v_gastado := public.gasto_generaciones_mes(p_org);
  if v_gastado + p_estimado > p_tope then
    raise exception 'Supera el tope mensual' using errcode = 'PT402';
  end if;

  insert into public.verificaciones_texto (organizacion_id, creativo_id, generacion_id, modelo, version_prompt, version_comparacion, textos_hash, estado, cobro, costo_estimado_usd, creado_por)
  values (p_org, p_creativo, v_gen.id, p_modelo, p_version, p_version_comp, v_gen.textos_hash, 'pendiente', 'propio', p_estimado, p_usuario)
  returning * into v;

  return v;
end;
$$;

-- Cierra una verificación pendiente con lo que pasó. Siempre con el costo real (nunca null: si no se supo, el tope).
-- 22023 parámetros inválidos · PT404 no existe · PT409 ya estaba cerrada.
create function public.cerrar_verificacion_texto(
  p_id uuid, p_estado text, p_leido jsonb, p_diferencias jsonb, p_avisos jsonb, p_zona_logo jsonb, p_fondo_logo text, p_costo numeric, p_tokens_entrada integer, p_tokens_salida integer, p_error text
)
returns public.verificaciones_texto
language plpgsql
set search_path = ''
as $$
declare
  v public.verificaciones_texto;
begin
  if p_estado is null or p_estado not in ('ok', 'difiere', 'error') then
    raise exception 'El estado de cierre no es válido' using errcode = '22023';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'El costo real no es válido' using errcode = '22023';
  end if;
  if p_estado = 'ok' and jsonb_array_length(coalesce(p_diferencias, '[]'::jsonb)) > 0 then
    raise exception 'Una verificación ok no puede tener diferencias' using errcode = '22023';
  end if;
  if p_estado = 'difiere' and jsonb_array_length(coalesce(p_diferencias, '[]'::jsonb)) = 0 then
    raise exception 'Una verificación que difiere necesita sus diferencias' using errcode = '22023';
  end if;

  select * into v from public.verificaciones_texto where id = p_id for update;
  if not found then
    raise exception 'La verificación no existe' using errcode = 'PT404';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'La verificación ya estaba cerrada' using errcode = 'PT409';
  end if;

  update public.verificaciones_texto
     set estado         = p_estado,
         leido          = p_leido,
         diferencias    = case when p_estado = 'error' then '[]'::jsonb else coalesce(p_diferencias, '[]'::jsonb) end,
         avisos         = coalesce(p_avisos, '[]'::jsonb),
         zona_logo      = p_zona_logo,
         fondo_logo     = p_fondo_logo,
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
-- aprobar_promocion: misma firma; la copia fiel exige una verificación ok y el snapshot suma verificacion_id
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
  if v_promo.escena_creativo_id is null or p_placa_ruta is null or p_placa_hash is null then
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
      'referencia_diseno_id', v_promo.referencia_diseno_id
    ) || case when v_verificacion is null then '{}'::jsonb else jsonb_build_object('verificacion_id', v_verificacion) end,
    p_placa_ruta,
    p_usuario
  )
  returning * into v_apro;

  return v_apro;
end;
$$;

revoke all on function public.gasto_generaciones_mes(uuid) from public, anon, authenticated;
grant execute on function public.gasto_generaciones_mes(uuid) to service_role;
revoke all on function public.reservar_verificacion_texto(uuid, uuid, text, text, text, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.reservar_verificacion_texto(uuid, uuid, text, text, text, numeric, numeric, uuid) to service_role;
revoke all on function public.cerrar_verificacion_texto(uuid, text, jsonb, jsonb, jsonb, jsonb, text, numeric, integer, integer, text) from public, anon, authenticated;
grant execute on function public.cerrar_verificacion_texto(uuid, text, jsonb, jsonb, jsonb, jsonb, text, numeric, integer, integer, text) to service_role;
revoke all on function public.aprobar_promocion(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_promocion(uuid, integer, text, text, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer; ninguna promoción puede tener plantilla 'copia_fiel' y no tiene que haber generaciones con textos_esperados):
-- 1) volver gasto_generaciones_mes y aprobar_promocion a las versiones de 20261117120000_plantilla_referencia.sql (create or replace con esos cuerpos);
-- drop function public.cerrar_verificacion_texto(uuid, text, jsonb, jsonb, jsonb, jsonb, text, numeric, integer, integer, text);
-- drop function public.reservar_verificacion_texto(uuid, uuid, text, text, text, numeric, numeric, uuid);
-- alter table public.promociones drop constraint promociones_copia_con_referencia;
-- drop table public.verificaciones_texto;
-- alter table public.generaciones drop constraint generaciones_copia_sin_lote, drop constraint generaciones_copia_completa, drop column textos_esperados, drop column textos_hash, drop column modelo_verificacion;
