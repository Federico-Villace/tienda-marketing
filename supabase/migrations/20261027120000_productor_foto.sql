-- El Productor edita fotos reales (ADR-023): subir una foto de la moto y pedir
-- una edición (fondo, escenario, formato).
--
-- · `fotos` guarda el original del cliente con la DECLARACIÓN DE DERECHOS
--   versionada: quién la aceptó, cuándo y con qué texto. El borrado es suave:
--   se elimina el objeto y `ruta` queda en null, pero la fila queda porque las
--   generaciones y los creativos derivados la referencian (on delete restrict)
--   y conservan la auditoría de derechos y de costo.
-- · El bucket `fotos` es NUEVO, privado y sin ninguna policy: los originales
--   del cliente tienen otra vida (borrado, derechos) que los derivados de IA
--   (bucket `creativos`). Solo el servidor (clave secreta) lee y escribe.
-- · Una generación nace de una pieza O de una foto, nunca de las dos. Un
--   creativo tiene exactamente un origen: la raíz de una pieza o una foto.
-- · Los creativos de una foto NO se eligen todavía: "elegida" sirve para
--   publicar una pieza (fase 4) y una foto no es una pieza. `elegir_creativo`
--   responde PT422 y un check lo respalda.
-- · `gasto_generaciones_mes` y `confirmar_generacion` no cambian: la compuerta
--   es la misma.

-- ═══════════════════════════════════════════════════════════════
-- fotos
-- ═══════════════════════════════════════════════════════════════

create table fotos (
  id               uuid primary key,   -- lo genera el servidor: también es el nombre del archivo
  organizacion_id  uuid not null references organizaciones(id) on delete cascade,
  -- organizacion_id/id.jpg dentro del bucket; null cuando se borró el objeto.
  ruta             text,
  mime_type        text not null check (mime_type = 'image/jpeg'),
  ancho            integer not null check (ancho between 512 and 2048),
  alto             integer not null check (alto between 512 and 2048),
  bytes            integer not null check (bytes between 1 and 4000000),
  subida_por       uuid references auth.users(id) on delete set null,
  -- Declaración de derechos: obligatoria y versionada.
  derechos_por     uuid not null references auth.users(id) on delete restrict,
  derechos_en      timestamptz not null,
  derechos_version text not null,
  borrada_en       timestamptz,
  borrada_por      uuid references auth.users(id) on delete set null,
  creado_en        timestamptz not null default now(),
  -- Sin ruta solo si la foto está borrada.
  check (ruta is not null or borrada_en is not null)
);

create index on fotos (organizacion_id, creado_en desc) where borrada_en is null;

alter table fotos enable row level security;
create policy "lectura por pertenencia" on fotos
  for select using (es_miembro(organizacion_id));

-- ═══════════════════════════════════════════════════════════════
-- Bucket privado de originales. Sin policies en el schema de storage.
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- generaciones y creativos: el origen puede ser una foto
-- ═══════════════════════════════════════════════════════════════

alter table generaciones
  add column foto_id uuid references fotos(id) on delete restrict,
  add column edicion text,
  add constraint generaciones_un_origen check (pieza_id is null or foto_id is null),
  add constraint generaciones_edicion_con_foto check ((foto_id is null) = (edicion is null));

create index on generaciones (foto_id, creado_en desc);

alter table creativos
  alter column pieza_id drop not null,
  alter column pieza_raiz_id drop not null,
  add column foto_id uuid references fotos(id) on delete restrict,
  add constraint creativos_un_origen check (num_nonnulls(pieza_raiz_id, foto_id) = 1),
  add constraint creativos_pieza_completa check ((pieza_id is null) = (pieza_raiz_id is null)),
  add constraint creativos_elegida_de_pieza check (not elegida or pieza_raiz_id is not null);

create index on creativos (foto_id);

-- ═══════════════════════════════════════════════════════════════
-- Elegir la imagen de una pieza: las de una foto no se eligen (PT422)
-- Misma firma y mismo retorno que antes, así que alcanza con create or replace.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.elegir_creativo(p_id uuid, p_elegida boolean, p_usuario uuid)
returns public.creativos
language plpgsql
set search_path = ''
as $$
declare
  v public.creativos;
begin
  select * into v from public.creativos where id = p_id;
  if not found then
    raise exception 'El creativo no existe' using errcode = 'PT404';
  end if;

  -- Un creativo de foto no tiene raíz de pieza: no hay nada que elegir.
  if v.pieza_raiz_id is null then
    raise exception 'Las imágenes de una foto no se eligen todavía' using errcode = 'PT422';
  end if;

  perform 1 from public.creativos where pieza_raiz_id = v.pieza_raiz_id for update;
  select * into v from public.creativos where id = p_id;

  -- Solo se elige una imagen que existe.
  if v.ruta is null then
    raise exception 'Ese creativo no tiene imagen' using errcode = 'PT409';
  end if;

  if p_elegida then
    -- Primero se libera a la anterior: el índice parcial admite una sola.
    update public.creativos
       set elegida = false, elegido_por = null, elegido_en = null
     where pieza_raiz_id = v.pieza_raiz_id and elegida and id <> p_id;
    update public.creativos
       set elegida = true, elegido_por = p_usuario, elegido_en = now()
     where id = p_id
    returning * into v;
  else
    update public.creativos
       set elegida = false, elegido_por = null, elegido_en = null
     where id = p_id
    returning * into v;
  end if;

  return v;
end;
$$;

revoke all on function public.elegir_creativo(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.elegir_creativo(uuid, boolean, uuid) to service_role;

-- BAJADA (manual, solo si hay que deshacer. Los buckets deben estar sin fotos antes
-- y no puede haber creativos ni generaciones de foto; hay que borrarlos primero):
-- alter table creativos
--   drop constraint creativos_elegida_de_pieza,
--   drop constraint creativos_pieza_completa,
--   drop constraint creativos_un_origen,
--   drop column foto_id,
--   alter column pieza_id set not null,
--   alter column pieza_raiz_id set not null;
-- alter table generaciones
--   drop constraint generaciones_edicion_con_foto,
--   drop constraint generaciones_un_origen,
--   drop column edicion,
--   drop column foto_id;
-- drop table fotos;
-- delete from storage.buckets where id = 'fotos';
-- (elegir_creativo puede quedar como está: el PT422 solo se dispara con creativos de foto.)
