import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261103120000_analista_v4.sql'), 'utf8')
/** El SQL sin comentarios: la bajada comentada no cuenta como ejecutable. */
const ejecutable = sql.replace(/^--.*$/gm, '')
const original = readFileSync(join(process.cwd(), 'supabase/migrations/20261028120000_analisis_ediciones.sql'), 'utf8')

const funcion = (src: string, nombre: string, cabecera: string) => {
  const m = src.match(new RegExp(`${cabecera} public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración del Analista v4 · analisis', () => {
  it('suma formato (texto por defecto, así los análisis viejos siguen siendo texto) y entrada', () => {
    expect(sql).toMatch(/add column formato text not null default 'texto' check \(formato in \('texto', 'estructurado'\)\)/)
    expect(sql).toMatch(/add column entrada jsonb/)
  })

  it('un análisis estructurado no puede existir sin la entrada que se le mandó al modelo', () => {
    expect(sql).toMatch(/constraint analisis_estructurado_con_entrada\s+check \(formato = 'texto' or entrada is not null\)/)
  })

  it('es aditiva: no borra columnas ni toca el hash del caché', () => {
    expect(ejecutable).not.toMatch(/drop (column|table)/i)
    expect(ejecutable).not.toMatch(/hash_entrada/)
  })

  it('no abre escritura a clientes ni guarda tokens (reglas #4 y #5)', () => {
    expect(ejecutable).not.toMatch(/create policy/i)
    expect(ejecutable).not.toMatch(/\b(token_ref|api_key|secret|password|clave)\b/i)
  })
})

describe('migración del Analista v4 · ediciones de 16000', () => {
  it('suelta el check autogenerado de la migración original (ese nombre existe) y pone uno con nombre', () => {
    expect(original).toMatch(/contenido\s+text not null check \(char_length\(contenido\) between 1 and 8000\)/)
    expect(sql).toMatch(/drop constraint if exists ediciones_analisis_contenido_check/)
    expect(sql).toMatch(/add constraint ediciones_analisis_contenido_largo\s+check \(char_length\(contenido\) between 1 and 16000\)/)
  })
})

describe('migración del Analista v4 · editar_analisis', () => {
  const f = () => funcion(sql, 'editar_analisis', 'create or replace function')
  const base = () => funcion(original, 'editar_analisis', 'create function')

  it('mantiene la firma: create or replace sin cambiar argumentos ni retorno', () => {
    const firma = (s: string) => s.match(/\(p_id uuid[^)]*\)\s*returns public\.ediciones_analisis/)![0]
    expect(firma(f())).toBe(firma(base()))
  })

  it('solo cambia el tope: 8000 → 16000, con el mismo lock y los mismos códigos', () => {
    expect(f()).toMatch(/between 1 and 16000/)
    expect(f()).not.toMatch(/8000/)
    expect(f().replaceAll('16000', '8000').replace(/create or replace function/, 'create function')).toBe(base())
  })

  it('sigue plpgsql con search_path vacío, for update y PT404/PT409/22023', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/from public\.analisis where id = p_id for update/)
    for (const c of ['PT404', 'PT409', '22023']) expect(f()).toContain(`errcode = '${c}'`)
  })

  it('revoca a todos y concede solo a service_role (se repite por las dudas)', () => {
    expect(sql).toContain('revoke all on function public.editar_analisis(uuid, integer, text, uuid) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.editar_analisis(uuid, integer, text, uuid) to service_role;')
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('trae la bajada comentada', () => {
    expect(sql).toMatch(/^-- BAJADA/m)
  })
})
