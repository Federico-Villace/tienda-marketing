import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const archivo = '20261118120000_copia_fiel.sql'
const leer = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8')
const sql = leer(archivo)
const referencia = leer('20261117120000_plantilla_referencia.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const activo = sinComentarios(sql)
const plano = (s: string) => sinComentarios(s).replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()

const funcion = (nombre: string, src = sql) => {
  const m = src.match(new RegExp(`create (?:or replace )?function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}
const tabla = (() => {
  const m = sql.match(/create table public\.verificaciones_texto \([\s\S]*?\n\);/)
  if (!m) throw new Error('no existe la tabla')
  return m[0]
})()
const alterGeneraciones = (() => {
  const m = sql.match(/alter table public\.generaciones[\s\S]*?;\n/)
  if (!m) throw new Error('no existe el alter de generaciones')
  return m[0]
})()

describe('migración copia-fiel · generaciones', () => {
  it('el timestamp es posterior a la última migración (20261117120000)', () => {
    expect(Number(archivo.slice(0, 14))).toBeGreaterThan(20261117120000)
  })
  it('suma el snapshot de textos (objeto ≤ 2 KB), su hash sha256 y el modelo que verifica (dato, sin lista de ids)', () => {
    expect(alterGeneraciones).toMatch(/textos_esperados jsonb check \(textos_esperados is null or \(jsonb_typeof\(textos_esperados\) = 'object' and pg_column_size\(textos_esperados\) <= 2048\)\)/)
    expect(alterGeneraciones).toMatch(/textos_hash text check \(textos_hash is null or textos_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(alterGeneraciones).toMatch(/modelo_verificacion text check \(modelo_verificacion is null or char_length\(modelo_verificacion\) between 1 and 80\)/)
    expect(activo).not.toMatch(/gemini|flash|argon/i)
  })
  it('las tres columnas van juntas o ninguna', () => {
    expect(alterGeneraciones).toMatch(/generaciones_copia_completa check \(\(textos_esperados is null\) = \(modelo_verificacion is null\) and \(textos_esperados is null\) = \(textos_hash is null\)\)/)
  })
  it('una copia fiel nunca va en un lote de motos o de textos', () => {
    expect(alterGeneraciones).toMatch(/generaciones_copia_sin_lote check \(lote_id is null or textos_esperados is null\)/)
  })
})

describe('migración copia-fiel · la tabla de verificaciones', () => {
  it('organización y creativo y generación con cascade', () => {
    expect(tabla).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(tabla).toMatch(/creativo_id\s+uuid not null references public\.creativos\(id\) on delete cascade/)
    expect(tabla).toMatch(/generacion_id\s+uuid not null references public\.generaciones\(id\) on delete cascade/)
  })
  it('modelo y versiones son DATOS acotados; el hash es sha256', () => {
    expect(tabla).toMatch(/modelo\s+text not null check \(char_length\(modelo\) between 1 and 80\)/)
    expect(tabla).toMatch(/version_prompt\s+text not null check \(char_length\(version_prompt\) between 1 and 60\)/)
    expect(tabla).toMatch(/version_comparacion\s+text not null check \(char_length\(version_comparacion\) between 1 and 60\)/)
    expect(tabla).toMatch(/textos_hash\s+text not null check \(textos_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  })
  it('estado cerrado a cuatro valores y cobro a dos', () => {
    expect(tabla).toMatch(/estado\s+text not null check \(estado in \('pendiente', 'ok', 'difiere', 'error'\)\)/)
    expect(tabla).toMatch(/cobro\s+text not null check \(cobro in \('generacion', 'propio'\)\)/)
  })
  it("'ok' nunca con diferencias, 'difiere' siempre con alguna, 'pendiente' sin costo real", () => {
    expect(tabla).toMatch(/check \(estado <> 'ok' or jsonb_array_length\(diferencias\) = 0\)/)
    expect(tabla).toMatch(/check \(estado <> 'difiere' or jsonb_array_length\(diferencias\) > 0\)/)
    expect(tabla).toMatch(/check \(estado <> 'pendiente' or \(costo_real_usd is null and terminado_en is null\)\)/)
  })
  it('lo leído, las diferencias y los avisos están acotados', () => {
    expect(tabla).toMatch(/leido\s+jsonb check \(leido is null or \(jsonb_typeof\(leido\) = 'object' and pg_column_size\(leido\) <= 6144\)\)/)
    expect(tabla).toMatch(/diferencias\s+jsonb not null default '\[\]' check \(jsonb_typeof\(diferencias\) = 'array' and pg_column_size\(diferencias\) <= 4096\)/)
    expect(tabla).toMatch(/avisos\s+jsonb not null default '\[\]' check \(jsonb_typeof\(avisos\) = 'array' and pg_column_size\(avisos\) <= 4096\)/)
    expect(tabla).toMatch(/zona_logo\s+jsonb check/)
    expect(tabla).toMatch(/fondo_logo\s+text check \(fondo_logo is null or fondo_logo in \('claro', 'oscuro'\)\)/)
  })
  it('el costo estimado es obligatorio y positivo (regla #3) y el real nunca negativo', () => {
    expect(tabla).toMatch(/costo_estimado_usd\s+numeric\(10,6\) not null check \(costo_estimado_usd > 0\)/)
    expect(tabla).toMatch(/costo_real_usd\s+numeric\(10,6\) check \(costo_real_usd is null or costo_real_usd >= 0\)/)
  })
  it('un índice único parcial: una sola verificación en vuelo por imagen', () => {
    expect(activo).toMatch(/create unique index verificaciones_texto_una_en_vuelo on public\.verificaciones_texto \(creativo_id\) where estado = 'pendiente'/)
  })
  it('RLS activada y SOLO una política de lectura por pertenencia (ningún cliente escribe)', () => {
    expect(activo).toContain('alter table public.verificaciones_texto enable row level security;')
    const politicas = [...activo.matchAll(/create policy [^;]*verificaciones_texto[^;]*;/g)].map((m) => m[0])
    expect(politicas).toHaveLength(1)
    expect(politicas[0]).toMatch(/for select using \(public\.es_miembro\(organizacion_id\)\)/)
  })
  it('no guarda tokens ni claves (regla #4)', () => {
    expect(tabla).not.toMatch(/\b(token|clave|secret|api_key|base64)\b/i)
  })
})

describe('promociones: la copia fiel necesita su referencia', () => {
  it("check: plantilla 'copia_fiel' exige inspiracion_foto_id", () => {
    expect(activo).toMatch(/promociones_copia_con_referencia check \(plantilla is distinct from 'copia_fiel' or inspiracion_foto_id is not null\)/)
  })
  it('no toca el check de la moto al centro (copia_fiel no es plantilla de diseño)', () => {
    expect(activo).not.toMatch(/promociones_diseno_moto_al_centro/)
  })
})

describe('gasto_generaciones_mes (toca plata)', () => {
  const nueva = () => plano(funcion('gasto_generaciones_mes'))
  const anterior = () => plano(funcion('gasto_generaciones_mes', referencia))
  it('misma firma y modelo de seguridad', () => {
    expect(nueva()).toMatch(/gasto_generaciones_mes\(p_org uuid\) returns numeric language plpgsql stable set search_path = ''/)
  })
  it('lo anterior queda palabra por palabra (generaciones y lecturas)', () => {
    const hasta = (t: string) => t.slice(t.indexOf('return ('), t.indexOf(') + ( select coalesce(sum( case when r.estado'))
    const lecturas = (t: string) => t.slice(t.indexOf('select coalesce(sum( case when r.estado'), t.indexOf('r.creado_en >= date_trunc'))
    expect(hasta(nueva())).toBe(hasta(anterior()))
    expect(lecturas(nueva())).toBe(lecturas(anterior()))
  })
  it("suma APARTE las re-verificaciones (cobro 'propio'), acotado a 0; las de cobro 'generacion' NO se suman", () => {
    const f = nueva()
    expect(f).toMatch(/\) \+ \( select coalesce\(sum\( case when v\.estado = 'pendiente' then v\.costo_estimado_usd else coalesce\(v\.costo_real_usd, v\.costo_estimado_usd\) end \), 0\) from public\.verificaciones_texto v where v\.organizacion_id = p_org and v\.cobro = 'propio' and v\.creado_en >= date_trunc\('month', now\(\) at time zone 'America\/Argentina\/Buenos_Aires'\) at time zone 'America\/Argentina\/Buenos_Aires'/)
    expect(f.match(/from public\.verificaciones_texto/g)).toHaveLength(1)
    expect(f).not.toMatch(/cobro = 'generacion'/)
  })
})

describe('reservar_verificacion_texto (la compuerta de la re-verificación)', () => {
  const f = () => funcion('reservar_verificacion_texto')
  it('plpgsql, search_path vacío, devuelve la fila', () => {
    expect(f()).toMatch(/returns public\.verificaciones_texto\s+language plpgsql\s+set search_path = ''/)
  })
  it('valida tope, estimado positivo, modelo y versiones antes de tocar nada (22023)', () => {
    const antes = f().split('select g.* into v_gen')[0]!
    expect(antes).toMatch(/p_tope is null or p_tope <= 0/)
    expect(antes).toMatch(/p_estimado is null or p_estimado <= 0/)
    expect(antes).toMatch(/char_length\(p_modelo\) not between 1 and 80/)
    expect(antes.match(/errcode = '22023'/g)!.length).toBeGreaterThanOrEqual(3)
  })
  it('la imagen tiene que ser de la organización y tener archivo (PT404) y venir de una copia fiel (PT422)', () => {
    expect(f()).toMatch(/c\.id = p_creativo and c\.organizacion_id = p_org and c\.ruta is not null/)
    expect(f()).toMatch(/errcode = 'PT404'/)
    expect(f()).toMatch(/v_gen\.textos_esperados is null[\s\S]*?errcode = 'PT422'/)
  })
  it('serializa por organización ANTES de leer la última verificación y el gasto', () => {
    const t = f()
    const bloqueo = t.indexOf('from public.organizaciones where id = p_org for update')
    expect(bloqueo).toBeGreaterThan(-1)
    expect(bloqueo).toBeLessThan(t.indexOf('from public.verificaciones_texto where creativo_id = p_creativo'))
    expect(bloqueo).toBeLessThan(t.indexOf('gasto_generaciones_mes(p_org)'))
  })
  it("una ya revisada (ok o difiere) es PT409: un 'difiere' no se vuelve a tirar al dado", () => {
    expect(f()).toMatch(/v_ult\.estado in \('ok', 'difiere'\)[\s\S]*?errcode = 'PT409'/)
  })
  it('una pendiente de menos de 120 s es PT409; una más vieja pasa a error y se puede reintentar', () => {
    expect(f()).toMatch(/v_ult\.creado_en > now\(\) - interval '120 seconds'[\s\S]*?errcode = 'PT409'/)
    expect(f()).toMatch(/set estado = 'error'/)
  })
  it('el tope mensual: gasto + estimado > tope es PT402, y se mira ANTES de insertar', () => {
    const t = f()
    expect(t).toMatch(/v_gastado \+ p_estimado > p_tope[\s\S]*?errcode = 'PT402'/)
    expect(t.indexOf('PT402')).toBeLessThan(t.indexOf('insert into public.verificaciones_texto'))
  })
  it("inserta 'pendiente' con cobro 'propio', el hash de la generación y el estimado; nunca con costo real", () => {
    const ins = f().slice(f().indexOf('insert into public.verificaciones_texto'))
    expect(ins).toMatch(/'pendiente', 'propio', p_estimado/)
    expect(ins).toMatch(/v_gen\.textos_hash/)
    expect(ins).not.toMatch(/costo_real_usd/)
  })
})

describe('cerrar_verificacion_texto', () => {
  const f = () => funcion('cerrar_verificacion_texto')
  it('bloquea la fila, solo cierra una pendiente (PT409) y exige costo real (nunca null)', () => {
    expect(f()).toMatch(/from public\.verificaciones_texto where id = p_id for update/)
    expect(f()).toMatch(/v\.estado <> 'pendiente'[\s\S]*?errcode = 'PT409'/)
    expect(f()).toMatch(/p_costo is null or p_costo < 0/)
    expect(f()).toMatch(/errcode = 'PT404'/)
  })
  it("el estado de cierre es ok, difiere o error; 'ok' sin diferencias y 'difiere' con diferencias", () => {
    expect(f()).toMatch(/p_estado not in \('ok', 'difiere', 'error'\)/)
    expect(f()).toMatch(/p_estado = 'ok' and jsonb_array_length\(coalesce\(p_diferencias, '\[\]'::jsonb\)\) > 0/)
    expect(f()).toMatch(/p_estado = 'difiere' and jsonb_array_length\(coalesce\(p_diferencias, '\[\]'::jsonb\)\) = 0/)
  })
  it('un error no guarda diferencias y siempre cierra con terminado_en', () => {
    expect(f()).toMatch(/case when p_estado = 'error' then '\[\]'::jsonb/)
    expect(f()).toMatch(/terminado_en\s+= now\(\)/)
  })
})

describe('aprobar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('aprobar_promocion')
  it('mantiene la firma y los errores', () => {
    expect(f()).toMatch(/aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)\s+returns public\.aprobaciones_promocion/)
    for (const e of ['PT404', 'PT409', 'PT422']) expect(f()).toContain(`errcode = '${e}'`)
  })
  it("la copia fiel exige que la ÚLTIMA verificación de la imagen elegida sea 'ok' (PT422), y solo ella", () => {
    const t = f()
    expect(t).toMatch(/if v_promo\.plantilla = 'copia_fiel' then/)
    expect(t).toMatch(/from public\.verificaciones_texto\s+where creativo_id = v_promo\.escena_creativo_id\s+order by creado_en desc\s+limit 1/)
    expect(t).toMatch(/v_verificacion is null or v_ver_estado <> 'ok'[\s\S]*?Los textos de la imagen no están verificados[\s\S]*?errcode = 'PT422'/)
    // La verificación se exige antes de aprobar (antes del update).
    expect(t.indexOf('Los textos de la imagen no están verificados')).toBeLessThan(t.indexOf('update public.promociones'))
  })
  it('el snapshot conserva todas las claves anteriores y suma verificacion_id solo si hay una', () => {
    const claves = (t: string) => [...t.matchAll(/'([a-z_]+)', v_promo\./g)].map((m) => m[1]!)
    const viejas = claves(funcion('aprobar_promocion', referencia))
    expect(viejas.length).toBeGreaterThan(15)
    for (const c of viejas) expect(claves(f()), c).toContain(c)
    expect(f()).toMatch(/\|\| case when v_verificacion is null then '\{\}'::jsonb else jsonb_build_object\('verificacion_id', v_verificacion\) end/)
    expect(f()).toMatch(/select \* into v_promo from public\.promociones where id = p_id for update/)
  })
  it('todo lo demás es idéntico a la versión anterior (solo se agregó la verificación)', () => {
    const quitar = (t: string) =>
      plano(t)
        .replace(/ v_verificacion uuid; v_ver_estado text;/, '')
        .replace(/ if v_promo\.plantilla = 'copia_fiel' then[\s\S]*?end if; end if;/, '')
        .replace(/ \|\| case when v_verificacion is null then '\{\}'::jsonb else jsonb_build_object\('verificacion_id', v_verificacion\) end/, '')
    expect(quitar(f())).toBe(quitar(funcion('aprobar_promocion', referencia)))
  })
})

describe('permisos y forma general', () => {
  it('las cuatro funciones son solo de service_role y nunca se concede a anon, authenticated ni public', () => {
    for (const n of ['gasto_generaciones_mes', 'reservar_verificacion_texto', 'cerrar_verificacion_texto', 'aprobar_promocion']) {
      expect(activo).toMatch(new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon, authenticated;`))
      expect(activo).toMatch(new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to service_role;`))
    }
    expect(activo).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
  it('es aditiva: una tabla nueva y nada se suelta', () => {
    expect([...activo.matchAll(/create table ([\w.]+)/g)].map((m) => m[1])).toEqual(['public.verificaciones_texto'])
    expect(activo).not.toMatch(/\bdrop\s+(table|column|index|function|type|constraint)/i)
  })
  it('las funciones de siempre no cambian de firma (la app las llama igual)', () => {
    expect(activo).toMatch(/create or replace function public\.aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)/)
    expect(activo).toMatch(/create or replace function public\.gasto_generaciones_mes\(p_org uuid\)/)
  })
  it('editar_promocion NO cambia: plantilla y diseno ya están en su lista blanca', () => {
    expect(activo).not.toMatch(/function public\.editar_promocion/)
    expect(referencia).toMatch(/'plantilla'/)
    expect(referencia).toMatch(/'diseno'/)
  })
  it('trae la bajada comentada, y toda comentada', () => {
    const bajada = sql.split('-- BAJADA')[1] ?? ''
    expect(bajada).toMatch(/-- drop table public\.verificaciones_texto/)
    expect(bajada).toMatch(/-- drop function public\.reservar_verificacion_texto/)
    expect(bajada).toMatch(/-- alter table public\.generaciones drop constraint/)
    expect(bajada.split('\n').slice(1).every((l) => l.trim() === '' || l.trim().startsWith('--'))).toBe(true)
  })
})
