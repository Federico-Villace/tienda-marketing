import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261028120000_analisis_ediciones.sql'), 'utf8')

const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración de ediciones del Analista · tabla', () => {
  it('guarda cada edición aparte: el original en `analisis` queda intacto y el caché por hash no se toca', () => {
    expect(sql).toMatch(/create table public\.ediciones_analisis/)
    expect(sql).toMatch(/analisis_id\s+uuid not null references public\.analisis\(id\) on delete cascade/)
    expect(sql).toMatch(/check \(version >= 2\)/)
    expect(sql).toMatch(/unique \(analisis_id, version\)/)
    expect(sql).not.toMatch(/alter table public\.analisis/i)
    expect(sql).not.toMatch(/hash_entrada/)
  })

  it('lleva quién y cuándo editó, y limita el largo del texto', () => {
    expect(sql).toMatch(/editado_por\s+uuid references auth\.users\(id\) on delete set null/)
    expect(sql).toMatch(/editado_en\s+timestamptz not null default now\(\)/)
    expect(sql).toMatch(/char_length\(contenido\) between 1 and 8000/)
  })

  it('RLS: solo lectura por pertenencia, ninguna política de escritura (regla #5)', () => {
    expect(sql).toContain('alter table public.ediciones_analisis enable row level security')
    expect(sql).toMatch(/create policy "lectura por pertenencia" on public\.ediciones_analisis\s+for select using \(public\.es_miembro\(organizacion_id\)\)/)
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda tokens ni claves (regla #4)', () => {
    expect(sql).not.toMatch(/\b(token_ref|api_key|secret|password|clave)\b/i)
  })
})

describe('migración de ediciones del Analista · editar_analisis', () => {
  const f = () => funcion('editar_analisis')

  it('plpgsql con search_path vacío', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
  })

  it('revoca a todos y concede solo a service_role', () => {
    expect(sql).toContain('revoke all on function public.editar_analisis(uuid, integer, text, uuid) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.editar_analisis(uuid, integer, text, uuid) to service_role;')
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('bloquea el análisis (for update) y exige que p_version sea la última: si no, PT409', () => {
    expect(f()).toMatch(/from public\.analisis where id = p_id for update/)
    expect(f()).toMatch(/coalesce\(max\(version\), 1\)/)
    expect(f()).toMatch(/p_version <> v_punta/)
    expect(f()).toMatch(/errcode = 'PT409'/)
  })

  it('un análisis inexistente es PT404 y un texto vacío o demasiado largo es 22023', () => {
    expect(f()).toMatch(/errcode = 'PT404'/)
    expect(f()).toMatch(/errcode = '22023'/)
    expect(f()).toMatch(/char_length\(p_contenido\)/)
  })

  it('inserta la versión siguiente (v_punta + 1) con quién la hizo', () => {
    expect(f()).toMatch(/insert into public\.ediciones_analisis/)
    expect(f()).toMatch(/v_punta \+ 1/)
    expect(f()).toMatch(/p_usuario/)
  })
})
