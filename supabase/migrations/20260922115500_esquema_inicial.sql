-- 0001 · Esquema inicial
-- Agencia de marketing con agentes · MVP fase 1
--
-- Convenciones:
--   · nombres en español, snake_case, tablas en plural
--   · toda tabla de ingesta guarda el JSON original en `crudo`
--   · toda tabla lleva `organizacion_id` desde el día 1 (multi-tenant futuro)
--   · RLS activo en todas las tablas, sin excepción

create extension if not exists "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- IDENTIDAD
-- ═══════════════════════════════════════════════════════════════

create table organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  creado_en   timestamptz not null default now()
);

create type rol_miembro as enum ('director', 'operador', 'lector');

create table miembros (
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  rol             rol_miembro not null default 'lector',
  creado_en       timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);

create index on miembros (usuario_id);

-- ═══════════════════════════════════════════════════════════════
-- CUENTAS CONECTADAS
-- ═══════════════════════════════════════════════════════════════

create type tipo_cuenta_meta as enum ('instagram', 'facebook', 'ad_account');

create table cuentas_meta (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tipo            tipo_cuenta_meta not null,
  meta_id         text not null,
  nombre          text not null,
  -- NO guarda el token. Guarda el NOMBRE de la variable de entorno que lo tiene.
  -- Fase 4 (multi-tenant): pasa a referenciar un secreto de Supabase Vault.
  token_ref       text not null,
  conectada_en    timestamptz not null default now(),
  ultima_sync     timestamptz,
  unique (organizacion_id, tipo, meta_id)
);

-- ═══════════════════════════════════════════════════════════════
-- CAPA 1 · INGESTA (sin IA)
-- ═══════════════════════════════════════════════════════════════

create type plataforma as enum ('instagram', 'facebook');

create table publicaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cuenta_id       uuid not null references cuentas_meta(id) on delete cascade,
  meta_post_id    text not null,
  plataforma      plataforma not null,
  tipo            text,                -- IMAGE | VIDEO | CAROUSEL_ALBUM | REELS | STORY
  permalink       text,
  texto           text,
  media_url       text,
  publicado_en    timestamptz not null,
  capturado_en    timestamptz not null default now(),
  crudo           jsonb not null,
  unique (cuenta_id, meta_post_id)
);

create index on publicaciones (organizacion_id, publicado_en desc);

-- Serie temporal: las métricas de una publicación cambian con los días.
-- Se guarda una fila por captura, no se pisa. Permite ver la curva.
create table metricas_publicacion (
  id              uuid primary key default gen_random_uuid(),
  publicacion_id  uuid not null references publicaciones(id) on delete cascade,
  capturado_en    timestamptz not null default now(),
  vistas          integer,   -- `views`: métrica vigente desde jun-2026
  alcance         integer,   -- `reach`: legacy, puede venir null
  impresiones     integer,   -- `impressions`: legacy, puede venir null
  me_gusta        integer,
  comentarios     integer,
  compartidos     integer,
  guardados       integer,
  crudo           jsonb not null
);

create index on metricas_publicacion (publicacion_id, capturado_en desc);

create table campanias (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references organizaciones(id) on delete cascade,
  cuenta_id        uuid not null references cuentas_meta(id) on delete cascade,
  meta_campaign_id text not null,
  nombre           text not null,
  objetivo         text,
  estado           text,
  inicio           timestamptz,
  fin              timestamptz,
  capturado_en     timestamptz not null default now(),
  crudo            jsonb not null,
  unique (cuenta_id, meta_campaign_id)
);

create index on campanias (organizacion_id, inicio desc);

-- Grano diario: una fila por campaña por día. Es como entrega Meta los insights
-- y permite recalcular cualquier rango sin volver a pedir.
create table metricas_campania (
  id           uuid primary key default gen_random_uuid(),
  campania_id  uuid not null references campanias(id) on delete cascade,
  fecha        date not null,
  gasto        numeric(12,2),
  impresiones  integer,
  clics        integer,
  ctr          numeric(8,4),
  cpc          numeric(10,4),
  conversiones integer,
  crudo        jsonb not null,
  unique (campania_id, fecha)
);

create type estado_sync as enum ('corriendo', 'ok', 'error');

create table sincronizaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cuenta_id       uuid references cuentas_meta(id) on delete set null,
  tipo            text not null,        -- publicaciones | metricas | campanias
  estado          estado_sync not null default 'corriendo',
  iniciada_en     timestamptz not null default now(),
  terminada_en    timestamptz,
  filas_afectadas integer default 0,
  error           text
);

create index on sincronizaciones (organizacion_id, iniciada_en desc);

-- ═══════════════════════════════════════════════════════════════
-- CAPA 2 · ANÁLISIS (IA barata, cacheada)
-- ═══════════════════════════════════════════════════════════════

create table analisis (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tipo            text not null,        -- rendimiento | audiencia | comparativa
  rango_desde     date not null,
  rango_hasta     date not null,
  -- Llave del caché: hash de (organizacion, tipo, rango, version_prompt, ultima_sync).
  -- Si los cuatro son iguales, el análisis ya existe y NO se vuelve a pagar.
  hash_entrada    text not null,
  version_prompt  text not null,
  modelo          text not null,
  contenido       text not null,
  tokens_entrada  integer not null default 0,
  tokens_salida   integer not null default 0,
  costo_usd       numeric(10,6) not null default 0,
  creado_en       timestamptz not null default now(),
  unique (organizacion_id, hash_entrada)
);

create index on analisis (organizacion_id, creado_en desc);

-- ═══════════════════════════════════════════════════════════════
-- CAPA 3 · GENERACIÓN (fase 3 — declarada, todavía sin usar)
-- ═══════════════════════════════════════════════════════════════

create type tipo_generacion as enum ('imagen', 'video');
create type estado_generacion as enum ('estimada', 'confirmada', 'corriendo', 'ok', 'error');

create table generaciones (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references organizaciones(id) on delete cascade,
  motor               text not null,      -- flux-2-pro | runway-gen4-turbo | veo-3.1 | ...
  tipo                tipo_generacion not null,
  prompt              text not null,
  parametros          jsonb not null default '{}'::jsonb,
  -- La compuerta: se estima ANTES, se confirma a mano, se registra el real DESPUÉS.
  costo_estimado_usd  numeric(10,4) not null,
  costo_real_usd      numeric(10,4),
  estado              estado_generacion not null default 'estimada',
  confirmada_por      uuid references auth.users(id),
  confirmada_en       timestamptz,
  asset_url           text,
  error               text,
  creado_en           timestamptz not null default now()
);

create index on generaciones (organizacion_id, creado_en desc);

-- ═══════════════════════════════════════════════════════════════
-- RLS · todo cerrado por defecto, se abre por pertenencia
-- ═══════════════════════════════════════════════════════════════

alter table organizaciones       enable row level security;
alter table miembros             enable row level security;
alter table cuentas_meta         enable row level security;
alter table publicaciones        enable row level security;
alter table metricas_publicacion enable row level security;
alter table campanias            enable row level security;
alter table metricas_campania    enable row level security;
alter table sincronizaciones     enable row level security;
alter table analisis             enable row level security;
alter table generaciones         enable row level security;

-- `security definer` evita la recursión infinita al consultar `miembros`
-- desde una política que a su vez protege `miembros`.
create or replace function es_miembro(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from miembros
    where organizacion_id = org and usuario_id = auth.uid()
  );
$$;

create policy "lectura por pertenencia" on organizaciones
  for select using (es_miembro(id));

create policy "lectura propia" on miembros
  for select using (usuario_id = auth.uid());

create policy "lectura por pertenencia" on cuentas_meta
  for select using (es_miembro(organizacion_id));
create policy "lectura por pertenencia" on publicaciones
  for select using (es_miembro(organizacion_id));
create policy "lectura por pertenencia" on campanias
  for select using (es_miembro(organizacion_id));
create policy "lectura por pertenencia" on metricas_campania
  for select using (exists (
    select 1 from campanias c
    where c.id = campania_id and es_miembro(c.organizacion_id)
  ));
create policy "lectura por pertenencia" on metricas_publicacion
  for select using (exists (
    select 1 from publicaciones p
    where p.id = publicacion_id and es_miembro(p.organizacion_id)
  ));
create policy "lectura por pertenencia" on sincronizaciones
  for select using (es_miembro(organizacion_id));
create policy "lectura por pertenencia" on analisis
  for select using (es_miembro(organizacion_id));
create policy "lectura por pertenencia" on generaciones
  for select using (es_miembro(organizacion_id));

-- La escritura la hace SIEMPRE el backend con la service role key, que saltea
-- RLS. Ningún cliente escribe directo: así el cron y los agentes son el único
-- camino de entrada de datos.
