-- Editar análisis anteriores del Analista (ADR-024).
--
-- · Una edición es una fila nueva en ediciones_analisis (versión 2, 3, ...). El
--   análisis original NO se toca: `analisis.contenido` queda como lo escribió el
--   modelo (v1) y sigue siendo la llave del caché por hash (unique org + hash).
--   La versión vigente es la última edición, o el original si no hay ninguna.
-- · Mismo patrón de concurrencia que editar_plan / editar_pieza: la función
--   bloquea la raíz (for update) y exige que la versión que la persona veía sea
--   la última; si no, PT409 (HTTP 409).
-- · Editar es humano: no llama al LLM ni gasta plata. Ningún cliente escribe
--   (regla dura #5): solo service_role ejecuta la función.

create table public.ediciones_analisis (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  analisis_id     uuid not null references public.analisis(id) on delete cascade,
  -- La v1 es el original en `analisis`; las ediciones arrancan en 2.
  version         integer not null check (version >= 2),
  contenido       text not null check (char_length(contenido) between 1 and 8000),
  editado_por     uuid references auth.users(id) on delete set null,
  editado_en      timestamptz not null default now(),
  unique (analisis_id, version)
);

create index on public.ediciones_analisis (organizacion_id, analisis_id);

alter table public.ediciones_analisis enable row level security;

create policy "lectura por pertenencia" on public.ediciones_analisis
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

create function public.editar_analisis(p_id uuid, p_version integer, p_contenido text, p_usuario uuid)
returns public.ediciones_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_analisis public.analisis;
  v_punta    integer;
  v_nueva    public.ediciones_analisis;
begin
  if p_contenido is null or char_length(p_contenido) not between 1 and 8000 then
    raise exception 'El análisis debe tener entre 1 y 8000 caracteres' using errcode = '22023';
  end if;

  select * into v_analisis from public.analisis where id = p_id for update;
  if not found then
    raise exception 'El análisis no existe' using errcode = 'PT404';
  end if;

  select coalesce(max(version), 1) into v_punta from public.ediciones_analisis where analisis_id = p_id;
  if p_version <> v_punta then
    raise exception 'Este análisis cambió: recargá' using errcode = 'PT409';
  end if;

  insert into public.ediciones_analisis (organizacion_id, analisis_id, version, contenido, editado_por)
  values (v_analisis.organizacion_id, p_id, v_punta + 1, p_contenido, p_usuario)
  returning * into v_nueva;

  return v_nueva;
end;
$$;

revoke all on function public.editar_analisis(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.editar_analisis(uuid, integer, text, uuid) to service_role;
