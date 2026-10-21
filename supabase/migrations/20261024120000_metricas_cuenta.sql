-- Mensajes recibidos por cuenta y día (ADR-020).
--
-- Meta no dice qué publicación originó una conversación: el dato es de la CUENTA.
-- Una fila por (cuenta, fecha AR) con tres conteos:
--   · conversaciones_activas: conversaciones cuya última actividad cayó ese día.
--     Sumar un período ≈ conversaciones con actividad en el período.
--   · conversaciones_nuevas: conversaciones nuevas ese día (solo Messenger: la
--     métrica de insights de página; Instagram no la tiene).
--   · mensajes: suma de message_count de esas conversaciones (solo Messenger;
--     Instagram devuelve 0/ausente, por eso queda null = "Meta no lo informa").
--
-- PRIVACIDAD: solo conteos. Nada de contenido, participantes ni ids de
-- conversación; el crudo guarda únicamente agregados y valores de insights.

create table public.metricas_cuenta (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references public.organizaciones(id) on delete cascade,
  cuenta_id              uuid not null references public.cuentas_meta(id) on delete cascade,
  fecha                  date not null,
  conversaciones_activas integer,
  conversaciones_nuevas  integer,
  mensajes               integer,
  crudo                  jsonb not null,
  capturado_en           timestamptz not null default now(),
  unique (cuenta_id, fecha)
);

create index on public.metricas_cuenta (organizacion_id, fecha desc);

alter table public.metricas_cuenta enable row level security;

create policy "lectura por pertenencia" on public.metricas_cuenta
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la clave secreta (regla #5).

create function public.resumen_mensajes(p_organizacion uuid, p_desde date, p_hasta date default null)
returns table (
  cuenta_id              uuid,
  tipo                   public.tipo_cuenta_meta,
  meta_id                text,
  conversaciones_activas bigint,
  conversaciones_nuevas  bigint,
  mensajes               bigint,
  dias                   integer
)
language sql
stable
set search_path = ''
as $$
  select
    cm.id,
    cm.tipo,
    cm.meta_id,
    sum(m.conversaciones_activas),
    sum(m.conversaciones_nuevas),
    sum(m.mensajes),
    count(m.id)::integer
  from public.metricas_cuenta m
  join public.cuentas_meta cm on cm.id = m.cuenta_id
  where m.organizacion_id = p_organizacion
    and m.fecha >= p_desde
    and (p_hasta is null or m.fecha <= p_hasta)
  group by cm.id, cm.tipo, cm.meta_id
  order by cm.tipo, cm.meta_id;
$$;

revoke all on function public.resumen_mensajes(uuid, date, date) from public, anon, authenticated;
grant execute on function public.resumen_mensajes(uuid, date, date) to service_role;
