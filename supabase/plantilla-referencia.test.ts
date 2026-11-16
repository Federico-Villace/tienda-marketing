import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const archivo = '20261117120000_plantilla_referencia.sql'
const leer = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8')
const sql = leer(archivo)
const productor = leer('20261026120000_productor.sql')
const anterior = leer('20261110120000_plantillas_diseno.sql')

const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const activo = sinComentarios(sql)
/** Sin comentarios de línea ni diferencias de espacios: sirve para comparar bloques de SQL. */
const plano = (s: string) => sinComentarios(s).replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()

const funcion = (nombre: string, src = sql) => {
  const m = src.match(new RegExp(`create (?:or replace )?function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}
const tabla = (() => {
  const m = sql.match(/create table public\.referencias_diseno \([\s\S]*?\n\);/)
  if (!m) throw new Error('no existe la tabla')
  return m[0]
})()

describe('migración plantilla-referencia · la tabla de lecturas', () => {
  it('el timestamp es posterior a la última migración (20261110120000)', () => {
    expect(Number(archivo.slice(0, 14))).toBeGreaterThan(20261110120000)
  })
  it('es una caché por foto: organización con cascade, foto con restrict, sha256 hex de 64', () => {
    expect(tabla).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(tabla).toMatch(/foto_id\s+uuid not null references public\.fotos\(id\) on delete restrict/)
    expect(tabla).toMatch(/sha256\s+text not null check \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  })
  it('el modelo es un DATO: texto acotado, sin lista de ids permitidos (cambiar de modelo no necesita migración)', () => {
    expect(tabla).toMatch(/modelo\s+text not null check \(char_length\(modelo\) between 1 and 80\)/)
    expect(tabla).not.toMatch(/modelo\s+text[^,]*\bin \(/)
    expect(activo).not.toMatch(/gemini|flash|argon/i)
  })
  it('guarda versión del prompt y de la reparación', () => {
    expect(tabla).toMatch(/version_prompt\s+text not null/)
    expect(tabla).toMatch(/version_reparacion\s+text not null/)
  })
  it('estado cerrado a cuatro valores y cada uno exige lo suyo', () => {
    expect(tabla).toMatch(/estado\s+text not null check \(estado in \('pendiente', 'lista', 'inutilizable', 'error'\)\)/)
    expect(tabla).toMatch(/check \(estado <> 'lista' or \(plantilla is not null and fallback is null\)\)/)
    expect(tabla).toMatch(/check \(estado <> 'inutilizable' or \(plantilla is null and fallback is not null\)\)/)
    expect(tabla).toMatch(/check \(estado <> 'pendiente' or \(costo_real_usd is null and terminado_en is null\)\)/)
  })
  it('crudo ≤ 8 KB y plantilla ≤ 4 KB, ambos objetos o null', () => {
    expect(tabla).toMatch(/crudo\s+jsonb check \(crudo is null or \(jsonb_typeof\(crudo\) = 'object' and pg_column_size\(crudo\) <= 8192\)\)/)
    expect(tabla).toMatch(/plantilla\s+jsonb check \(plantilla is null or \(jsonb_typeof\(plantilla\) = 'object' and pg_column_size\(plantilla\) <= 4096\)\)/)
  })
  it('el fallback es una de las tres plantillas de siempre', () => {
    expect(tabla).toMatch(/fallback\s+text check \(fallback is null or fallback in \('impactante_textura', 'deportiva', 'editorial'\)\)/)
  })
  it('el costo estimado es obligatorio y positivo (regla #3: nada gasta sin estimarse) y el real nunca negativo', () => {
    expect(tabla).toMatch(/costo_estimado_usd\s+numeric\(10,6\) not null check \(costo_estimado_usd > 0\)/)
    expect(tabla).toMatch(/costo_real_usd\s+numeric\(10,6\) check \(costo_real_usd is null or costo_real_usd >= 0\)/)
  })
  it('el error y los tokens están acotados', () => {
    expect(tabla).toMatch(/error\s+text check \(error is null or char_length\(error\) <= 500\)/)
    expect(tabla).toMatch(/tokens_entrada\s+integer check \(tokens_entrada is null or tokens_entrada >= 0\)/)
  })
  it('un índice único parcial: una lectura viva por (organización, sha256, modelo, versión del prompt)', () => {
    expect(sql).toMatch(/create unique index referencias_diseno_unica\s+on public\.referencias_diseno \(organizacion_id, sha256, modelo, version_prompt\)\s+where estado in \('pendiente', 'lista', 'inutilizable'\)/)
  })
  it('RLS activada y SOLO una política de lectura por pertenencia (ningún cliente escribe)', () => {
    expect(sql).toMatch(/alter table public\.referencias_diseno enable row level security/)
    const politicas = [...activo.matchAll(/create policy "[^"]+" on public\.referencias_diseno\s+for (\w+)/g)].map((m) => m[1])
    expect(politicas).toEqual(['select'])
    expect(sql).toMatch(/for select using \(public\.es_miembro\(organizacion_id\)\)/)
  })
  it('no guarda tokens ni claves (regla #4)', () => {
    expect(tabla).not.toMatch(/\b(token|token_ref|api_key|secret|password|clave)\b/i)
  })
})

describe('promociones apunta a su lectura', () => {
  it('gana referencia_diseno_id con on delete restrict', () => {
    expect(sql).toMatch(/add column referencia_diseno_id uuid references public\.referencias_diseno\(id\) on delete restrict/)
  })
  it("la plantilla 'referencia' exige su lectura", () => {
    expect(sql).toMatch(/add constraint promociones_referencia_con_lectura check \(plantilla is distinct from 'referencia' or referencia_diseno_id is not null\)/)
  })
  it("las de diseño (ahora cuatro) siguen llevando la moto al centro", () => {
    expect(sql).toMatch(/drop constraint promociones_diseno_moto_al_centro;/)
    expect(sql).toMatch(/add constraint promociones_diseno_moto_al_centro check \(plantilla is null or plantilla not in \('impactante_textura', 'deportiva', 'editorial', 'referencia'\) or posicion_moto = 'centro'\)/)
  })
})

describe('gasto_generaciones_mes (toca plata): sin lecturas devuelve EXACTAMENTE lo de antes', () => {
  const nueva = () => funcion('gasto_generaciones_mes')
  const original = () => funcion('gasto_generaciones_mes', productor)

  it('misma firma y mismo modelo de seguridad', () => {
    expect(nueva()).toMatch(/gasto_generaciones_mes\(p_org uuid\)\s+returns numeric\s+language plpgsql\s+stable\s+set search_path = ''/)
    expect(original()).toMatch(/gasto_generaciones_mes\(p_org uuid\)\s+returns numeric\s+language plpgsql\s+stable\s+set search_path = ''/)
  })
  it('la consulta de generaciones es LA MISMA, palabra por palabra, que la de la migración original', () => {
    const consulta = (f: string) => {
      const m = plano(f).match(/select coalesce\(sum\( case when g\.estado[\s\S]*?date_trunc\('month', now\(\) at time zone 'America\/Argentina\/Buenos_Aires'\) at time zone 'America\/Argentina\/Buenos_Aires'/)
      if (!m) throw new Error('no se encontró la consulta de generaciones')
      return m[0]
    }
    expect(consulta(nueva())).toBe(consulta(original()))
    expect(consulta(original())).toMatch(/from public\.generaciones g where g\.organizacion_id = p_org and g\.confirmada_en is not null and g\.estado in \('confirmada', 'corriendo', 'ok', 'error'\)/)
  })
  it('lo nuevo es una suma APARTE y acotada a 0: sin lecturas (o sin tabla llena) no agrega nada', () => {
    const f = plano(nueva())
    // ( generaciones ) + ( coalesce(sum(lecturas), 0) )
    expect(f).toMatch(/\) \+ \( select coalesce\(sum\( case when r\.estado = 'pendiente' then r\.costo_estimado_usd else coalesce\(r\.costo_real_usd, r\.costo_estimado_usd\) end \), 0\) from public\.referencias_diseno r where r\.organizacion_id = p_org and r\.creado_en >= date_trunc\('month'/)
    expect(f.match(/from public\.referencias_diseno/g)).toHaveLength(1)
    // La suma de generaciones también sigue acotada a 0 con coalesce.
    expect(f).toMatch(/select coalesce\(sum\( case when g\.estado in \('confirmada', 'corriendo'\) then g\.costo_estimado_usd else coalesce\(g\.costo_real_usd, g\.costo_estimado_usd\) end \), 0\) from public\.generaciones g/)
  })
  it('las lecturas se cuentan por el mes calendario de Buenos Aires, igual que lo demás', () => {
    expect(plano(nueva())).toMatch(/r\.creado_en >= date_trunc\('month', now\(\) at time zone 'America\/Argentina\/Buenos_Aires'\) at time zone 'America\/Argentina\/Buenos_Aires'/)
  })
  it('pendiente = lo estimado; cerrada o con error = lo real, y si no se supo lo estimado', () => {
    expect(nueva()).toMatch(/when r\.estado = 'pendiente' then r\.costo_estimado_usd/)
    expect(nueva()).toMatch(/else coalesce\(r\.costo_real_usd, r\.costo_estimado_usd\)/)
  })
  it('sigue siendo solo de service_role', () => {
    expect(sql).toContain('revoke all on function public.gasto_generaciones_mes(uuid) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.gasto_generaciones_mes(uuid) to service_role;')
  })
})

describe('reservar_lectura_referencia (la compuerta de costo de la lectura)', () => {
  const f = () => funcion('reservar_lectura_referencia')
  it('plpgsql, search_path vacío, devuelve la fila', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/returns public\.referencias_diseno/)
  })
  it('valida tope, estimado positivo, sha256 y modelo antes de tocar nada (22023)', () => {
    expect(f()).toMatch(/p_tope is null or p_tope <= 0/)
    expect(f()).toMatch(/p_estimado is null or p_estimado <= 0/)
    expect(f()).toMatch(/p_sha !~ '\^\[0-9a-f\]\{64\}\$'/)
    expect(f()).toContain("errcode = '22023'")
  })
  it('la foto tiene que ser de la organización y no estar borrada (PT404)', () => {
    expect(f()).toMatch(/from public\.fotos where id = p_foto and organizacion_id = p_org and borrada_en is null/)
    expect(f()).toContain("errcode = 'PT404'")
  })
  it('serializa por organización ANTES de leer caché y gasto', () => {
    const t = f()
    expect(t).toMatch(/from public\.organizaciones where id = p_org for update/)
    expect(t.indexOf('public.organizaciones')).toBeLessThan(t.indexOf("estado in ('lista', 'inutilizable')"))
    expect(t.indexOf('public.organizaciones')).toBeLessThan(t.indexOf('gasto_generaciones_mes'))
  })
  it('la caché (lista o inutilizable) se devuelve SIN pasar por el tope y sin insertar', () => {
    const t = f()
    const cache = t.indexOf("estado in ('lista', 'inutilizable')")
    expect(cache).toBeGreaterThan(-1)
    expect(t.slice(cache, t.indexOf('gasto_generaciones_mes'))).toMatch(/return v;/)
    expect(cache).toBeLessThan(t.indexOf('insert into'))
  })
  it('una pendiente de menos de 120 s es PT409; una más vieja pasa a error y se puede reintentar', () => {
    expect(f()).toMatch(/creado_en > now\(\) - interval '120 seconds'/)
    expect(f()).toContain("errcode = 'PT409'")
    expect(f()).toMatch(/set estado = 'error'/)
  })
  it('una lectura en error NO bloquea ni se reutiliza: la reserva solo mira lista/inutilizable/pendiente y inserta una nueva (reintento tras un timeout)', () => {
    const cuerpo = f()
    expect(cuerpo).not.toMatch(/estado in \([^)]*'error'/)
    expect(cuerpo).toMatch(/estado in \('lista', 'inutilizable'\)/)
    expect(cuerpo).toMatch(/estado = 'pendiente'/)
    expect(cuerpo).toMatch(/insert into public\.referencias_diseno/)
  })
  it('el tope mensual: gasto + estimado > tope es PT402, y se mira ANTES de insertar', () => {
    const t = f()
    expect(t).toMatch(/v_gastado \+ p_estimado > p_tope/)
    expect(t).toContain("errcode = 'PT402'")
    expect(t.indexOf('PT402')).toBeLessThan(t.indexOf('insert into'))
  })
  it("inserta 'pendiente' con el estimado y quién la pidió; nunca con costo real", () => {
    expect(f()).toMatch(/insert into public\.referencias_diseno \([^)]*costo_estimado_usd, creado_por\)\s+values \([^)]*'pendiente', p_estimado, p_usuario\)/)
    expect(f()).not.toMatch(/insert into[^;]*costo_real_usd/)
  })
  it('solo service_role', () => {
    const firma = 'uuid, uuid, text, text, text, text, numeric, numeric, uuid'
    expect(sql).toContain(`revoke all on function public.reservar_lectura_referencia(${firma}) from public, anon, authenticated;`)
    expect(sql).toContain(`grant execute on function public.reservar_lectura_referencia(${firma}) to service_role;`)
  })
})

describe('cerrar_lectura_referencia', () => {
  const f = () => funcion('cerrar_lectura_referencia')
  it('bloquea la fila, solo cierra una pendiente (PT409) y exige costo real (nunca null)', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/where id = p_id for update/)
    expect(f()).toMatch(/v\.estado <> 'pendiente'/)
    expect(f()).toContain("errcode = 'PT409'")
    expect(f()).toContain("errcode = 'PT404'")
    expect(f()).toMatch(/p_costo is null or p_costo < 0/)
  })
  it("el estado de cierre es lista, inutilizable o error; la plantilla solo en 'lista' y el fallback solo en 'inutilizable'", () => {
    expect(f()).toMatch(/p_estado not in \('lista', 'inutilizable', 'error'\)/)
    expect(f()).toMatch(/plantilla\s+= case when p_estado = 'lista' then p_plantilla else null end/)
    expect(f()).toMatch(/fallback\s+= case when p_estado = 'inutilizable' then p_fallback else null end/)
    expect(f()).toMatch(/costo_real_usd = p_costo/)
  })
  it('solo service_role', () => {
    const firma = 'uuid, text, jsonb, jsonb, text, text[], numeric, integer, integer, text'
    expect(sql).toContain(`revoke all on function public.cerrar_lectura_referencia(${firma}) from public, anon, authenticated;`)
    expect(sql).toContain(`grant execute on function public.cerrar_lectura_referencia(${firma}) to service_role;`)
  })
})

describe('editar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('editar_promocion')
  const antes = () => funcion('editar_promocion', anterior)
  it('mantiene la firma, el candado de la fila y los errores', () => {
    expect(f()).toMatch(/editar_promocion\(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid\)\s+returns public\.promociones/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/from public\.promociones where id = p_id for update/)
    for (const e of ['PT404', 'PT409', '22023']) expect(f()).toContain(`errcode = '${e}'`)
  })
  it('la lista blanca conserva TODO lo anterior y suma referencia_diseno_id', () => {
    const lista = (t: string) => [...(t.match(/v_permitidas constant text\[\] := array\[([\s\S]*?)\];/)![1]!.matchAll(/'([a-z_]+)'/g))].map((m) => m[1]!)
    const nuevas = lista(f())
    for (const c of lista(antes())) expect(nuevas, c).toContain(c)
    expect(nuevas).toContain('referencia_diseno_id')
    expect(nuevas).toHaveLength(lista(antes()).length + 1)
  })
  it('cambiar de lectura invalida la placa pero NO la escena', () => {
    expect(f().match(/v_cambia_placa := [\s\S]*?;\n/)![0]).toContain("p_campos ? 'referencia_diseno_id'")
    expect(f().match(/v_cambia_escena := [\s\S]*?;\n/)![0]).not.toContain('referencia')
  })
  it('lo que ya invalidaba la placa o la escena sigue igual', () => {
    for (const k of ['v_cambia_placa', 'v_cambia_escena']) {
      const nuevo = f().match(new RegExp(`${k} := [\\s\\S]*?;\\n`))![0]
      const viejo = antes().match(new RegExp(`${k} := [\\s\\S]*?;\\n`))![0]
      for (const linea of viejo.split('\n').map((l) => l.trim()).filter(Boolean)) expect(nuevo, linea).toContain(linea)
    }
  })
  it('escribe la columna solo si viene en los campos', () => {
    expect(f()).toMatch(/referencia_diseno_id = case when p_campos \? 'referencia_diseno_id' then \(p_campos->>'referencia_diseno_id'\)::uuid else referencia_diseno_id end/)
  })
  it('la lectura tiene que ser de la misma organización y estar cerrada; la plantilla referencia exige una LISTA (PT422)', () => {
    expect(f()).toMatch(/r\.organizacion_id = v_ant\.organizacion_id\s+and r\.estado in \('lista', 'inutilizable'\)/)
    expect(f()).toMatch(/v_nueva\.plantilla = 'referencia' and not exists/)
    expect(f()).toMatch(/r\.estado = 'lista'/)
    expect(f()).toContain("errcode = 'PT422'")
  })
  it('todo lo demás del UPDATE sigue igual (cada asignación anterior está)', () => {
    const asignaciones = (t: string) => plano(t.match(/update public\.promociones set([\s\S]*?)where id = p_id/)![1]!).split(/,\s(?=[a-z_]+\s+=\s)/)
    for (const a of asignaciones(antes())) expect(plano(f()), a.slice(0, 40)).toContain(a.trim().replace(/,$/, ''))
  })
})

describe('aprobar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('aprobar_promocion')
  it('mantiene la firma y los errores', () => {
    expect(f()).toMatch(/aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)\s+returns public\.aprobaciones_promocion/)
    for (const e of ['PT404', 'PT409', 'PT422']) expect(f()).toContain(`errcode = '${e}'`)
  })
  it('el snapshot conserva todas las claves anteriores y suma referencia_diseno_id, armado desde la fila bloqueada', () => {
    const claves = (t: string) => [...t.matchAll(/'([a-z_]+)', v_promo\./g)].map((m) => m[1]!)
    const viejas = claves(funcion('aprobar_promocion', anterior))
    expect(viejas.length).toBeGreaterThan(10)
    for (const c of viejas) expect(claves(f()), c).toContain(c)
    expect(f()).toContain("'referencia_diseno_id', v_promo.referencia_diseno_id")
    expect(f()).toMatch(/select \* into v_promo from public\.promociones where id = p_id for update/)
  })
})

describe('permisos y forma general', () => {
  it('las cinco funciones son solo de service_role y nunca se concede a anon, authenticated ni public', () => {
    for (const n of ['gasto_generaciones_mes', 'reservar_lectura_referencia', 'cerrar_lectura_referencia', 'editar_promocion', 'aprobar_promocion']) {
      expect(activo).toMatch(new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon, authenticated;`))
      expect(activo).toMatch(new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to service_role;`))
    }
    expect(activo).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
  it('es aditiva: una sola tabla nueva y lo único que se suelta es el check que se vuelve a crear', () => {
    expect([...activo.matchAll(/create table ([\w.]+)/g)].map((m) => m[1])).toEqual(['public.referencias_diseno'])
    expect([...activo.matchAll(/\bdrop\s+(\w+)\s+([\w.]+)/gi)].map((m) => `${m[1]} ${m[2]}`)).toEqual(['constraint promociones_diseno_moto_al_centro'])
    expect(activo).not.toMatch(/\bdrop\s+(table|column|index|function|type)/i)
  })
  it('las funciones de siempre no cambian de firma (la app las llama igual)', () => {
    expect(activo).toMatch(/create or replace function public\.editar_promocion\(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid\)/)
    expect(activo).toMatch(/create or replace function public\.aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)/)
    expect(activo).toMatch(/create or replace function public\.gasto_generaciones_mes\(p_org uuid\)/)
  })
  it('referencia_diseno_id no lo puede escribir un cliente: no está en la lista de campos de cambios.ts', () => {
    const cambios = readFileSync(join(process.cwd(), 'lib/promocion/cambios.ts'), 'utf8')
    const campos = cambios.match(/const CAMPOS = \[([^\]]*)\]/)![1]!
    expect(campos).not.toMatch(/referencia/i)
    expect(campos).toContain("'diseno'")
  })
  it('trae la bajada comentada, y toda comentada', () => {
    const bajada = sql.split('-- BAJADA')[1] ?? ''
    expect(bajada).toMatch(/-- drop table public\.referencias_diseno/)
    expect(bajada).toMatch(/-- drop function public\.reservar_lectura_referencia/)
    expect(bajada.split('\n').slice(1).every((l) => l.trim() === '' || l.trim().startsWith('--'))).toBe(true)
  })
})
