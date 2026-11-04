-- Posts con pauta: que un post con plata atrás no se lea como contenido que funcionó.
--
-- · anuncios: los ads de cada cuenta publicitaria (todos los estados). Guarda a qué
--   publicación apunta cada uno (story_id en Facebook, instagram_media_id en
--   Instagram) para poder marcar el post como pago. Capa 1: la llena la ingesta.
-- · resumen_publicaciones gana con_pauta y campania_pauta. Cambia el tipo de
--   retorno, así que se dropea y se recrea; eso borra los permisos, por eso el
--   revoke/grant vuelve al final (igual que antes: solo service_role).
--
-- Pauta = existe un anuncio de la misma organización con estado distinto de
-- 'DISAPPROVED' que apunta al post. Falso positivo conservador: un anuncio creado
-- y pausado sin entregar también marca el post (solo lo saca del ranking).

create table public.anuncios (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  cuenta_id          uuid not null references public.cuentas_meta(id) on delete cascade,
  meta_ad_id         text not null,
  meta_campaign_id   text,
  campania_nombre    text,
  nombre             text,
  estado             text,
  story_id           text,
  instagram_media_id text,
  creado_en_meta     timestamptz,
  capturado_en       timestamptz not null default now(),
  crudo              jsonb not null,
  unique (cuenta_id, meta_ad_id)
);

create index on public.anuncios (organizacion_id, story_id);
create index on public.anuncios (organizacion_id, instagram_media_id);

alter table public.anuncios enable row level security;

create policy "lectura por pertenencia" on public.anuncios
  for select using (public.es_miembro(organizacion_id));

-- La escritura la hace SIEMPRE el backend con la service role key: sin políticas
-- de insert/update/delete.

drop function if exists public.resumen_publicaciones(uuid, date, date);

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
  fecha_metrica   date,
  con_pauta       boolean,
  campania_pauta  text
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, cm.meta_id, p.plataforma, p.tipo, p.texto, p.permalink, p.publicado_en,
    m.vistas, m.alcance, m.clics, m.me_gusta, m.comentarios, m.compartidos, m.guardados, m.fecha,
    pa.meta_ad_id is not null,
    pa.campania_nombre
  from public.publicaciones p
  join public.cuentas_meta cm on cm.id = p.cuenta_id
  left join lateral (
    select * from public.metricas_publicacion mp
     where mp.publicacion_id = p.id
     order by mp.fecha desc
     limit 1
  ) m on true
  left join lateral (
    select a.meta_ad_id, a.campania_nombre
      from public.anuncios a
     where a.organizacion_id = p.organizacion_id
       and a.estado is distinct from 'DISAPPROVED'
       and (
         (p.plataforma = 'facebook' and a.story_id = p.meta_post_id)
         or (p.plataforma = 'instagram' and a.instagram_media_id = p.meta_post_id)
       )
     order by a.creado_en_meta desc nulls last
     limit 1
  ) pa on true
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

-- BAJADA (manual, solo si hay que deshacer; luego recrear la versión de 20261021120000):
-- drop function public.resumen_publicaciones(uuid, date, date);
-- drop table public.anuncios;
