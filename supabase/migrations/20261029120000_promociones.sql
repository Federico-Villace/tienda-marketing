-- Promoción paso a paso (ADR-027): una entrada única para ir de "qué querés
-- promocionar" a una pieza aprobada (placa PNG + texto).
--
-- · `promociones` es el BORRADOR MUTABLE del wizard: un wizard cambia campos
--   sueltos veinte veces y versionar cada tecla llenaría la tabla. La
--   concurrencia es optimista (`revision`): editar con una revisión vieja es
--   PT409. El paso en el que está la persona NO es una columna: se deriva de
--   lo que ya hay cargado (así nunca hay un estado inconsistente).
-- · `aprobaciones_promocion` es lo que importa auditar: una fila inmutable por
--   cada aprobación (version 1..n) con un snapshot armado EN SQL desde la fila
--   bloqueada, no con lo que mande el cliente. Misma idea que ADR-024: el
--   original se preserva, lo humano se agrega.
-- · `textos_promocion` guarda cada llamada del redactor (3 opciones exactas) y
--   hace de caché por hash. Cada llamada conserva su costo.
-- · La escena de Gemini NO tiene tabla nueva: sale por la compuerta de costo
--   existente (generaciones/creativos). `generaciones.promocion_id` solo
--   etiqueta de qué promoción es.
-- · Ningún cliente escribe (regla dura #5): las funciones solo las ejecuta
--   service_role. PT404/PT409/PT422 son los códigos que PostgREST traduce a HTTP.
-- · Ninguna columna guarda tokens ni credenciales (regla dura #4).

create type public.estado_promocion as enum ('borrador', 'aprobada', 'descartada');

-- ═══════════════════════════════════════════════════════════════
-- promociones y textos_promocion (se referencian entre sí: la FK de textos se
-- agrega después de crear promociones)
-- ═══════════════════════════════════════════════════════════════

create table public.textos_promocion (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references public.organizaciones(id) on delete cascade,
  promocion_id        uuid not null,
  hash_entrada        text not null,
  version_prompt      text not null,
  modelo              text not null,
  intento             integer not null default 1 check (intento between 1 and 20),
  -- Siempre tres opciones: el redactor devuelve exactamente 3.
  opciones            jsonb not null check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) = 3),
  -- Hash de los datos con los que se escribió: avisa si después se cambiaron.
  datos_hash          text not null,
  tokens_entrada      integer not null default 0,
  tokens_salida       integer not null default 0,
  tokens_cacheados    integer not null default 0,
  tokens_razonamiento integer not null default 0,
  costo_usd           numeric(10,6) not null default 0,
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now(),
  unique (organizacion_id, hash_entrada)
);

create table public.promociones (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  estado             public.estado_promocion not null default 'borrador',
  revision           integer not null default 1 check (revision >= 1),
  marca_id           text not null check (char_length(marca_id) between 1 and 40),
  modelo             text not null check (char_length(modelo) between 2 and 60),
  -- {precio:{moneda,monto}, promo:{tipo,detalle}, lugar, indicaciones}
  datos              jsonb not null,
  foto_id            uuid not null references public.fotos(id) on delete restrict,
  aspecto            text not null check (aspecto in ('1:1', '4:5', '9:16')),
  plantilla          text check (char_length(plantilla) <= 40),
  fondo              text check (char_length(fondo) <= 40),
  analisis_id        uuid references public.analisis(id) on delete set null,
  textos_id          uuid references public.textos_promocion(id) on delete set null,
  copy               jsonb,
  copy_opcion        smallint check (copy_opcion between 1 and 3),
  copy_editado       boolean not null default false,
  titular            text check (char_length(titular) <= 40),
  escena_creativo_id uuid references public.creativos(id) on delete restrict,
  -- La placa final vive en el bucket `creativos`; acá solo su ruta y el hash de lo que la generó.
  placa_ruta         text,
  placa_hash         text,
  creado_por         uuid references auth.users(id) on delete set null,
  creado_en          timestamptz not null default now(),
  actualizado_por    uuid references auth.users(id) on delete set null,
  actualizado_en     timestamptz not null default now(),
  check ((placa_ruta is null) = (placa_hash is null)),
  -- Una aprobada siempre tiene texto y placa.
  check (estado <> 'aprobada' or (copy is not null and placa_ruta is not null))
);

create index on public.promociones (organizacion_id, estado, actualizado_en desc);

alter table public.textos_promocion
  add constraint textos_promocion_promocion_fk
  foreign key (promocion_id) references public.promociones(id) on delete cascade;

create index on public.textos_promocion (promocion_id, creado_en desc);

create table public.aprobaciones_promocion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  promocion_id    uuid not null references public.promociones(id) on delete cascade,
  version         integer not null check (version >= 1),
  -- Foto fija de lo aprobado, armada en SQL: ver aprobar_promocion.
  snapshot        jsonb not null,
  placa_ruta      text not null,
  aprobado_por    uuid not null references auth.users(id) on delete restrict,
  aprobado_en     timestamptz not null default now(),
  unique (promocion_id, version)
);

create index on public.aprobaciones_promocion (organizacion_id, promocion_id);

alter table public.promociones enable row level security;
alter table public.textos_promocion enable row level security;
alter table public.aprobaciones_promocion enable row level security;

create policy "lectura por pertenencia" on public.promociones
  for select using (public.es_miembro(organizacion_id));
create policy "lectura por pertenencia" on public.textos_promocion
  for select using (public.es_miembro(organizacion_id));
create policy "lectura por pertenencia" on public.aprobaciones_promocion
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

-- ═══════════════════════════════════════════════════════════════
-- generaciones: de qué promoción es una escena
-- ═══════════════════════════════════════════════════════════════

alter table public.generaciones
  add column promocion_id uuid references public.promociones(id) on delete set null,
  add constraint generaciones_promocion_con_foto check (promocion_id is null or foto_id is not null);

create index on public.generaciones (promocion_id, creado_en desc) where promocion_id is not null;

-- ═══════════════════════════════════════════════════════════════
-- editar_promocion: aplica SOLO los campos de la lista blanca
-- ═══════════════════════════════════════════════════════════════

create function public.editar_promocion(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid)
returns public.promociones
language plpgsql
set search_path = ''
as $$
declare
  v_permitidas constant text[] := array[
    'marca_id', 'modelo', 'datos', 'foto_id', 'aspecto', 'plantilla', 'fondo',
    'analisis_id', 'textos_id', 'copy', 'copy_opcion', 'copy_editado', 'titular',
    'escena_creativo_id', 'placa_ruta', 'placa_hash'
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
-- aprobar_promocion: estado + snapshot inmutable, en una transacción
-- ═══════════════════════════════════════════════════════════════

create function public.aprobar_promocion(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid)
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
      'escena_creativo_id', v_promo.escena_creativo_id
    ),
    p_placa_ruta,
    p_usuario
  )
  returning * into v_apro;

  return v_apro;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- reabrir y descartar
-- ═══════════════════════════════════════════════════════════════

create function public.reabrir_promocion(p_id uuid, p_revision integer, p_usuario uuid)
returns public.promociones
language plpgsql
set search_path = ''
as $$
declare
  v_promo public.promociones;
begin
  select * into v_promo from public.promociones where id = p_id for update;
  if not found then
    raise exception 'La promoción no existe' using errcode = 'PT404';
  end if;
  if v_promo.estado <> 'aprobada' then
    raise exception 'Solo se reabre una aprobada' using errcode = 'PT409';
  end if;
  if v_promo.revision <> p_revision then
    raise exception 'Esta promoción cambió: recargá' using errcode = 'PT409';
  end if;

  -- La aprobación anterior queda en aprobaciones_promocion: es historial.
  update public.promociones
     set estado = 'borrador', revision = revision + 1, actualizado_por = p_usuario, actualizado_en = now()
   where id = p_id
  returning * into v_promo;

  return v_promo;
end;
$$;

create function public.descartar_promocion(p_id uuid, p_revision integer, p_usuario uuid)
returns public.promociones
language plpgsql
set search_path = ''
as $$
declare
  v_promo public.promociones;
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

  -- No se borra nada: queda descartada.
  update public.promociones
     set estado = 'descartada', revision = revision + 1, actualizado_por = p_usuario, actualizado_en = now()
   where id = p_id
  returning * into v_promo;

  return v_promo;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- resumen_promocion: agregados para el LLM (regla #2: Postgres suma)
-- ═══════════════════════════════════════════════════════════════
--
-- · p_cuentas: ids de Meta de las cuentas de ESA marca (página de Facebook e Instagram).
-- · "Menciona el modelo": se compara el texto y el modelo normalizados (minúsculas,
--   sin tildes, solo letras y números), así "TRK-502", "trk 502" y "TRK502"
--   coinciden. strpos no interpreta comodines (% _), a diferencia de un ilike
--   armado con el texto de la persona. Con menos de 3 caracteres normalizados no se
--   filtra por modelo (daría falsos positivos) y `modeloFiltrable` lo informa.
-- · Hay UNA sola cuenta publicitaria para las 7 marcas: una campaña solo se
--   atribuye si su NOMBRE menciona la marca (p_marca, un token propio como
--   'benelli') o el modelo.
-- · Tipo de promo mencionada en el texto del posteo: el primer match de cuota,
--   contado, crédito, oferta/descuento/promo; si no, 'ninguna'.
-- · No devuelve ids ni permalinks: solo números y textos recortados a 140.

create function public.resumen_promocion(
  p_org uuid, p_cuentas text[], p_marca text, p_modelo text, p_desde date, p_hasta date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  par as (
    select
      regexp_replace(translate(lower(coalesce(p_modelo, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') as modelo_n,
      regexp_replace(translate(lower(coalesce(p_marca, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g') as marca_n
  ),
  fl as (
    select modelo_n, marca_n, char_length(modelo_n) >= 3 as modelo_filtrable from par
  ),
  posts as (
    select
      p.plataforma::text as plataforma,
      coalesce(p.tipo, 'sin_tipo') as tipo,
      p.publicado_en,
      left(coalesce(p.texto, ''), 140) as texto_corto,
      coalesce(m.vistas, 0) as vistas,
      coalesce(m.me_gusta, 0) + coalesce(m.comentarios, 0) + coalesce(m.compartidos, 0) + coalesce(m.guardados, 0) as interacciones,
      coalesce(m.comentarios, 0) as comentarios,
      (fl.modelo_filtrable
        and strpos(regexp_replace(translate(lower(coalesce(p.texto, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g'), fl.modelo_n) > 0
      ) as menciona_modelo,
      case
        when lower(coalesce(p.texto, '')) ~ 'cuota' then 'cuotas'
        when lower(coalesce(p.texto, '')) ~ 'contado' then 'contado'
        when lower(coalesce(p.texto, '')) ~ 'cr[eé]dito' then 'credito'
        when lower(coalesce(p.texto, '')) ~ '(oferta|descuento|promo)' then 'oferta'
        else 'ninguna'
      end as promo
    from public.publicaciones p
    join public.cuentas_meta cm on cm.id = p.cuenta_id
    cross join fl
    left join lateral (
      select * from public.metricas_publicacion mp
       where mp.publicacion_id = p.id
       order by mp.fecha desc
       limit 1
    ) m on true
    where p.organizacion_id = p_org
      and cm.meta_id = any(p_cuentas)
      and p.publicado_en >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and p.publicado_en < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ),
  organico as (
    select jsonb_agg(jsonb_build_object(
      'mencionaModelo', menciona_modelo,
      'plataforma', plataforma,
      'tipo', tipo,
      'publicaciones', n,
      'vistas', vistas,
      'interaccionesPromedio', round(interacciones::numeric / n, 1),
      'comentariosPromedio', round(comentarios::numeric / n, 1),
      'tasaInteraccion', round(interacciones::numeric / nullif(vistas, 0), 4)
    ) order by menciona_modelo desc, n desc) as v
    from (
      select menciona_modelo, plataforma, tipo,
             count(*) as n, sum(vistas) as vistas, sum(interacciones) as interacciones, sum(comentarios) as comentarios
        from posts
       group by menciona_modelo, plataforma, tipo
    ) g
  ),
  por_promo as (
    select jsonb_agg(jsonb_build_object(
      'promo', promo,
      'publicaciones', n,
      'vistas', vistas,
      'interaccionesPromedio', round(interacciones::numeric / n, 1),
      'tasaInteraccion', round(interacciones::numeric / nullif(vistas, 0), 4)
    ) order by n desc) as v
    from (
      select promo, count(*) as n, sum(vistas) as vistas, sum(interacciones) as interacciones
        from posts
       group by promo
    ) g
  ),
  candidatos as (
    -- Los que mencionan el modelo; si no hay ninguno, los de la marca.
    select * from posts
     where menciona_modelo or not exists (select 1 from posts where menciona_modelo)
     order by interacciones desc, publicado_en desc
     limit 3
  ),
  mejores as (
    select jsonb_agg(jsonb_build_object(
      'fecha', to_char(publicado_en at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
      'plataforma', plataforma,
      'tipo', tipo,
      'mencionaModelo', menciona_modelo,
      'texto', texto_corto,
      'vistas', vistas,
      'interacciones', interacciones
    ) order by interacciones desc, publicado_en desc) as v
    from candidatos
  ),
  camp as (
    select
      left(c.nombre, 80) as nombre,
      (fl.modelo_filtrable
        and strpos(regexp_replace(translate(lower(c.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g'), fl.modelo_n) > 0
      ) as menciona_modelo,
      coalesce(sum(m.gasto), 0) as gasto,
      coalesce(sum(m.impresiones), 0) as impresiones,
      coalesce(sum(m.clics), 0) as clics,
      coalesce(sum(m.conversiones), 0) as resultados
    from public.campanias c
    cross join fl
    join public.metricas_campania m on m.campania_id = c.id and m.fecha >= p_desde and m.fecha <= p_hasta
    where c.organizacion_id = p_org
      and (
        (fl.modelo_filtrable
          and strpos(regexp_replace(translate(lower(c.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g'), fl.modelo_n) > 0)
        or (fl.marca_n <> ''
          and strpos(regexp_replace(translate(lower(c.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g'), fl.marca_n) > 0)
      )
    group by c.id, c.nombre, fl.modelo_filtrable, fl.modelo_n
  ),
  camp_top as (
    select jsonb_agg(jsonb_build_object(
      'nombre', nombre,
      'mencionaModelo', menciona_modelo,
      'gasto', gasto,
      'impresiones', impresiones,
      'clics', clics,
      'resultados', resultados
    ) order by gasto desc) as v
    from (select * from camp order by gasto desc limit 5) t
  ),
  camp_tot as (
    select jsonb_build_object(
      'campanias', count(*),
      'gasto', coalesce(sum(gasto), 0),
      'impresiones', coalesce(sum(impresiones), 0),
      'clics', coalesce(sum(clics), 0),
      'resultados', coalesce(sum(resultados), 0)
    ) as v
    from camp
  )
  select jsonb_build_object(
    'modeloFiltrable', (select modelo_filtrable from fl),
    'publicaciones', (select count(*) from posts),
    'organico', coalesce((select v from organico), '[]'::jsonb),
    'porPromo', coalesce((select v from por_promo), '[]'::jsonb),
    'mejores', coalesce((select v from mejores), '[]'::jsonb),
    'campanias', jsonb_build_object(
      'totales', (select v from camp_tot),
      'top', coalesce((select v from camp_top), '[]'::jsonb)
    )
  );
$$;

revoke all on function public.editar_promocion(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.editar_promocion(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.aprobar_promocion(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_promocion(uuid, integer, text, text, uuid) to service_role;
revoke all on function public.reabrir_promocion(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.reabrir_promocion(uuid, integer, uuid) to service_role;
revoke all on function public.descartar_promocion(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.descartar_promocion(uuid, integer, uuid) to service_role;
revoke all on function public.resumen_promocion(uuid, text[], text, text, date, date) from public, anon, authenticated;
grant execute on function public.resumen_promocion(uuid, text[], text, text, date, date) to service_role;

-- BAJADA (manual, solo si hay que deshacer. Antes hay que descartar o borrar las promociones):
-- drop function public.resumen_promocion(uuid, text[], text, text, date, date);
-- drop function public.descartar_promocion(uuid, integer, uuid);
-- drop function public.reabrir_promocion(uuid, integer, uuid);
-- drop function public.aprobar_promocion(uuid, integer, text, text, uuid);
-- drop function public.editar_promocion(uuid, integer, jsonb, uuid);
-- alter table public.generaciones
--   drop constraint generaciones_promocion_con_foto,
--   drop column promocion_id;
-- drop table public.aprobaciones_promocion;
-- alter table public.textos_promocion drop constraint textos_promocion_promocion_fk;
-- drop table public.promociones;
-- drop table public.textos_promocion;
-- drop type public.estado_promocion;
