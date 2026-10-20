-- Clics por publicación (solo Facebook: post_clicks). Instagram no los informa
-- por publicación, así que la columna es nullable: null = "Meta no lo da".
--
-- resumen_publicaciones pasa a devolver también clics. Cambia el tipo de
-- retorno, y Postgres no deja hacerlo con create or replace: se dropea y se
-- recrea. Eso borra los permisos, por eso el revoke/grant va de nuevo al final.

alter table public.metricas_publicacion add column clics integer;

drop function if exists public.resumen_publicaciones(uuid, date);

create function public.resumen_publicaciones(p_organizacion uuid, p_desde date)
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
  order by p.publicado_en desc;
$$;

revoke all on function public.resumen_publicaciones(uuid, date) from public, anon, authenticated;
grant execute on function public.resumen_publicaciones(uuid, date) to service_role;
