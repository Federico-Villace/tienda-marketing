-- 0003 · Organización piloto y resumen de publicidad
--
-- · La organización 999 Motos con id fijo: lib/organizacion.ts la referencia.
-- · resumen_publicidad: la suma por campaña la hace Postgres, no el tablero ni
--   el LLM (regla dura #2). Solo la ejecuta service_role, igual que el resto
--   de la escritura y la lectura del backend.

insert into public.organizaciones (id, nombre)
values ('00000000-0000-4000-8000-000000000999', '999 Motos')
on conflict (id) do nothing;

create or replace function public.resumen_publicidad(p_organizacion uuid, p_desde date)
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
  join public.metricas_campania m on m.campania_id = c.id and m.fecha >= p_desde
  where c.organizacion_id = p_organizacion
  group by c.id, c.nombre, cm.nombre, c.objetivo, c.estado
  order by 6 desc;
$$;

revoke all on function public.resumen_publicidad(uuid, date) from public, anon, authenticated;
grant execute on function public.resumen_publicidad(uuid, date) to service_role;
