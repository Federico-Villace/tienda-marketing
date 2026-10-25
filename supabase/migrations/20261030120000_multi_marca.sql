-- Multi-marca (ADR-028): cargar una promoción UNA vez y sacar una pieza por marca.
--
-- · `tandas_promocion` es solo el PADRE: agrupa N promociones hijas (una por
--   marca). Cada hija es una `promociones` normal (ADR-027): misma revisión
--   optimista, mismo editar/aprobar/reabrir/descartar, mismo snapshot. Así no se
--   reescribe ninguna de las cinco RPCs de la promoción.
-- · La escena de Gemini se comparte: el prompt de la escena NO usa la marca, así
--   que N escenas serían pagar N veces lo mismo. `generaciones.tanda_id` etiqueta
--   la escena de la tanda; la marca va en la placa (next/og, gratis).
-- · Todo es ADITIVO: no cambia ninguna firma existente (cero drop/overload).
-- · Ningún cliente escribe (regla dura #5): las funciones solo las ejecuta
--   service_role. PT404 / 22023 / 23505 son los códigos que el backend traduce a HTTP.
-- · Ninguna columna guarda tokens ni credenciales (regla dura #4).

-- ═══════════════════════════════════════════════════════════════
-- tandas_promocion
-- ═══════════════════════════════════════════════════════════════

create table public.tandas_promocion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now()
);

create index on public.tandas_promocion (organizacion_id, creado_en desc);

alter table public.tandas_promocion enable row level security;

create policy "lectura por pertenencia" on public.tandas_promocion
  for select using (public.es_miembro(organizacion_id));

-- Sin políticas de escritura: escribe solo el backend con la sb_secret (regla #5).

-- ═══════════════════════════════════════════════════════════════
-- promociones y generaciones: a qué tanda pertenecen
-- ═══════════════════════════════════════════════════════════════

alter table public.promociones add column tanda_id uuid references public.tandas_promocion(id) on delete set null;

create index on public.promociones (tanda_id) where tanda_id is not null;

-- Una marca no se repite dentro de la misma tanda (las descartadas no cuentan: se puede rehacer).
create unique index promociones_tanda_marca_unica on public.promociones (tanda_id, marca_id)
  where tanda_id is not null and estado <> 'descartada';

-- La escena de una tanda es de la tanda o de una promoción, nunca de las dos.
alter table public.generaciones
  add column tanda_id uuid references public.tandas_promocion(id) on delete set null,
  add constraint generaciones_tanda_con_foto check (tanda_id is null or foto_id is not null),
  add constraint generaciones_promocion_xor_tanda check (promocion_id is null or tanda_id is null);

create index on public.generaciones (tanda_id, creado_en desc) where tanda_id is not null;

-- ═══════════════════════════════════════════════════════════════
-- crear_tanda_promocion: la tanda y sus N hijas, o nada
-- ═══════════════════════════════════════════════════════════════
-- · La validación de que cada marca esté en MARCAS y de la forma de `p_datos` la
--   hace el backend (validarPedido) antes; acá solo se defienden la cardinalidad
--   y la foto.
-- · Bloquea la foto para que no se borre entre la validación y el insert.

create function public.crear_tanda_promocion(
  p_org uuid, p_marcas text[], p_modelo text, p_datos jsonb, p_foto uuid, p_aspecto text, p_usuario uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tanda uuid;
  v_n     integer;
begin
  v_n := coalesce(array_length(p_marcas, 1), 0);
  if v_n < 2 or v_n > 7 or (select count(distinct m) from unnest(p_marcas) m) <> v_n then
    raise exception 'Elegí entre 2 y 7 marcas distintas' using errcode = '22023';
  end if;

  perform 1 from public.fotos where id = p_foto and organizacion_id = p_org and borrada_en is null and ruta is not null for update;
  if not found then
    raise exception 'La foto no existe o se borró' using errcode = 'PT404';
  end if;

  insert into public.tandas_promocion (organizacion_id, creado_por) values (p_org, p_usuario) returning id into v_tanda;

  insert into public.promociones (organizacion_id, tanda_id, marca_id, modelo, datos, foto_id, aspecto, creado_por, actualizado_por)
    select p_org, v_tanda, m, p_modelo, p_datos, p_foto, p_aspecto, p_usuario, p_usuario
      from unnest(p_marcas) with ordinality as t(m, i)
     order by i;

  return jsonb_build_object(
    'tandaId', v_tanda,
    'promociones', (
      select jsonb_agg(to_jsonb(p) order by p.creado_en, p.id) from public.promociones p where p.tanda_id = v_tanda
    )
  );
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- resumen_promocion_comparado: "cómo le fue a cada marca" en UNA ida y vuelta
-- ═══════════════════════════════════════════════════════════════
-- Envoltorio: llama a public.resumen_promocion (ADR-027) una vez por grupo × modelo,
-- sin tocarla. Sigue sumando Postgres (regla #2): al LLM y a la pantalla llegan números.
-- · p_grupos: [{clave, cuentas: [id de Meta], token}] (1 a 7), uno por marca.
-- · p_modelos: 1 a 3 modelos.

create function public.resumen_promocion_comparado(
  p_org uuid, p_grupos jsonb, p_modelos text[], p_desde date, p_hasta date
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_grupos) is distinct from 'array'
     or jsonb_array_length(p_grupos) not between 1 and 7
     or coalesce(array_length(p_modelos, 1), 0) not between 1 and 3 then
    raise exception 'Comparación inválida' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'clave', g->>'clave',
        'modelo', mo,
        'resumen', public.resumen_promocion(
          p_org, array(select jsonb_array_elements_text(g->'cuentas')), g->>'token', mo, p_desde, p_hasta
        )
      )
      order by gi, mi
    )
    from jsonb_array_elements(p_grupos) with ordinality as x(g, gi)
    cross join unnest(p_modelos) with ordinality as y(mo, mi)
  ), '[]'::jsonb);
end
$$;

revoke all on function public.crear_tanda_promocion(uuid, text[], text, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.crear_tanda_promocion(uuid, text[], text, jsonb, uuid, text, uuid) to service_role;

revoke all on function public.resumen_promocion_comparado(uuid, jsonb, text[], date, date) from public, anon, authenticated;
grant execute on function public.resumen_promocion_comparado(uuid, jsonb, text[], date, date) to service_role;

-- BAJADA (manual, solo si hay que deshacer):
-- drop function public.resumen_promocion_comparado(uuid, jsonb, text[], date, date);
-- drop function public.crear_tanda_promocion(uuid, text[], text, jsonb, uuid, text, uuid);
-- drop index public.generaciones_tanda_id_creado_en_idx;
-- alter table public.generaciones
--   drop constraint generaciones_promocion_xor_tanda,
--   drop constraint generaciones_tanda_con_foto,
--   drop column tanda_id;
-- drop index public.promociones_tanda_marca_unica;
-- alter table public.promociones drop column tanda_id;
-- drop table public.tandas_promocion;
