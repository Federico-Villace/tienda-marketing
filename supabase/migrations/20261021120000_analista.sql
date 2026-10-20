-- El Analista: filtro por período y registro de cada análisis.
--
-- · resumen_publicaciones y resumen_publicidad ganan p_hasta (default null =
--   comportamiento anterior, sin tope superior). Se dropea la firma de 2
--   argumentos: si quedara, una llamada con 2 argumentos sería ambigua entre
--   los dos overloads. Eso borra los permisos, por eso el revoke/grant vuelve.
-- · analisis guarda los filtros usados, quién lo pidió y los tokens extra
--   (cacheados y de razonamiento) que ya se reportan en la respuesta de OpenAI.
--   hash_entrada y unique(organizacion_id, hash_entrada) ya existen.

drop function if exists public.resumen_publicaciones(uuid, date);

create function public.resumen_publicaciones(p_organizacion uuid, p_desde date, p_hasta date default null)
returns table (
  publicacion_id  uuid,
  cuenta_meta_id  text,
  plataforma      public.plataforma,
  tipo            text,
  texto           text,
  permalink       text,
  publicado_en    timestamptz,
  vistas          integer,
  alcance         integer,
  clics           integer,
  me_gusta        integer,
  comentarios     integer,
  compartidos     integer,
  guardados       integer,
  fecha_metrica   date
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, cm.meta_id, p.plataforma, p.tipo, p.texto, p.permalink, p.publicado_en,
    m.vistas, m.alcance, m.clics, m.me_gusta, m.comentarios, m.compartidos, m.guardados, m.fecha
  from public.publicaciones p
  join public.cuentas_meta cm on cm.id = p.cuenta_id
  left join lateral (
    select * from public.metricas_publicacion mp
     where mp.publicacion_id = p.id
     order by mp.fecha desc
     limit 1
  ) m on true
  where p.organizacion_id = p_organizacion
    and p.publicado_en >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and (
      p_hasta is null
      or p.publicado_en < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    )
  order by p.publicado_en desc;
$$;

revoke all on function public.resumen_publicaciones(uuid, date, date) from public, anon, authenticated;
grant execute on function public.resumen_publicaciones(uuid, date, date) to service_role;

drop function if exists public.resumen_publicidad(uuid, date);

create function public.resumen_publicidad(p_organizacion uuid, p_desde date, p_hasta date default null)
returns table (
  campania_id  uuid,
  campania     text,
  cuenta       text,
  objetivo     text,
  estado       text,
  gasto        numeric,
  impresiones  bigint,
  clics        bigint,
  resultados   bigint,
  dias         integer,
  ultimo_dia   date
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.nombre,
    cm.nombre,
    c.objetivo,
    c.estado,
    coalesce(sum(m.gasto), 0),
    coalesce(sum(m.impresiones), 0),
    coalesce(sum(m.clics), 0),
    coalesce(sum(m.conversiones), 0),
    count(m.id)::integer,
    max(m.fecha)
  from public.campanias c
  join public.cuentas_meta cm on cm.id = c.cuenta_id
  join public.metricas_campania m on m.campania_id = c.id
    and m.fecha >= p_desde
    and (p_hasta is null or m.fecha <= p_hasta)
  where c.organizacion_id = p_organizacion
  group by c.id, c.nombre, cm.nombre, c.objetivo, c.estado
  order by 6 desc;
$$;

revoke all on function public.resumen_publicidad(uuid, date, date) from public, anon, authenticated;
grant execute on function public.resumen_publicidad(uuid, date, date) to service_role;

alter table public.analisis
  add column filtros jsonb not null default '{}'::jsonb,
  add column creado_por uuid references auth.users(id) on delete set null,
  add column tokens_cacheados integer not null default 0,
  add column tokens_razonamiento integer not null default 0;
