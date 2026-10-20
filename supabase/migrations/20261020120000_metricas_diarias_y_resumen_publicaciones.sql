-- Ingesta orgánica (ADR-016):
--  · metricas_publicacion pasa a una foto por publicación y día (fecha AR), para
--    que re-correr la ingesta el mismo día no duplique y PostgREST pueda usar
--    on_conflict (no acepta expresiones como capturado_en::date).
--  · resumen_publicaciones: la última foto de cada post la elige Postgres.

alter table public.metricas_publicacion add column fecha date;

update public.metricas_publicacion
   set fecha = (capturado_en at time zone 'America/Argentina/Buenos_Aires')::date;

-- Si había varias fotos del mismo día, queda la más reciente.
delete from public.metricas_publicacion a
 using public.metricas_publicacion b
 where a.publicacion_id = b.publicacion_id
   and a.fecha = b.fecha
   and (a.capturado_en, a.id) < (b.capturado_en, b.id);

alter table public.metricas_publicacion
  alter column fecha set default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  alter column fecha set not null,
  add constraint metricas_publicacion_publicacion_fecha_key unique (publicacion_id, fecha);

comment on column public.publicaciones.tipo is
  'imagen | video | carrusel | reel (normalizado; el valor de Meta queda en crudo)';

create or replace function public.resumen_publicaciones(p_organizacion uuid, p_desde date)
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
    m.vistas, m.alcance, m.me_gusta, m.comentarios, m.compartidos, m.guardados, m.fecha
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
  order by p.publicado_en desc;
$$;

revoke all on function public.resumen_publicaciones(uuid, date) from public, anon, authenticated;
grant execute on function public.resumen_publicaciones(uuid, date) to service_role;
