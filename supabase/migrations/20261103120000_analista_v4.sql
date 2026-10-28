-- Analista v4: análisis estructurado con su entrada guardada (ADR-033).
--
-- · analisis.formato distingue el texto plano de siempre ('texto', el default: los
--   análisis v1..v3 no se tocan) del JSON estructurado de analista-v4 ('estructurado').
-- · analisis.entrada guarda el payload EXACTO que se le mandó al modelo (agregados + hechos,
--   nunca filas crudas): sin él no se puede validar una edición contra los hechos citados
--   ni, más adelante, preguntarle al Analista sobre ese análisis aunque la sync cambie los datos.
-- · El JSON ocupa más que el texto: el tope de una edición sube de 8000 a 16000 caracteres.
--   El check de la migración original (20261028120000) es de columna y se creó sin nombre:
--   Postgres lo llamó ediciones_analisis_contenido_check.
-- · Aditiva: no borra nada ni toca el caché por hash. Ningún cliente escribe (regla #5).

alter table public.analisis
  add column formato text not null default 'texto' check (formato in ('texto', 'estructurado')),
  add column entrada jsonb;

alter table public.analisis
  add constraint analisis_estructurado_con_entrada
  check (formato = 'texto' or entrada is not null);

alter table public.ediciones_analisis
  drop constraint if exists ediciones_analisis_contenido_check;

alter table public.ediciones_analisis
  add constraint ediciones_analisis_contenido_largo
  check (char_length(contenido) between 1 and 16000);

-- Idéntica a la de 20261028120000: lo único que cambia es el tope (8000 -> 16000).
create or replace function public.editar_analisis(p_id uuid, p_version integer, p_contenido text, p_usuario uuid)
returns public.ediciones_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_analisis public.analisis;
  v_punta    integer;
  v_nueva    public.ediciones_analisis;
begin
  if p_contenido is null or char_length(p_contenido) not between 1 and 16000 then
    raise exception 'El análisis debe tener entre 1 y 16000 caracteres' using errcode = '22023';
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

-- BAJADA (manual, solo si no hay análisis estructurados ni ediciones de más de 8000):
--   alter table public.ediciones_analisis drop constraint if exists ediciones_analisis_contenido_largo;
--   alter table public.ediciones_analisis add constraint ediciones_analisis_contenido_check
--     check (char_length(contenido) between 1 and 8000);
--   -- y volver a crear editar_analisis con 8000 (ver 20261028120000_analisis_ediciones.sql).
--   alter table public.analisis drop constraint if exists analisis_estructurado_con_entrada;
--   alter table public.analisis drop column if exists entrada, drop column if exists formato;
