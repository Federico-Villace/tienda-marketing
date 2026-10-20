import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261021120000_analista.sql'), 'utf8')

describe('migración del Analista', () => {
  for (const fn of ['resumen_publicaciones', 'resumen_publicidad']) {
    describe(fn, () => {
      it('dropea la firma vieja de 2 argumentos (si no, la llamada sería ambigua)', () => {
        expect(sql).toMatch(new RegExp(`drop function if exists public\\.${fn}\\(uuid, date\\);`))
      })

      it('crea la firma nueva con p_hasta date default null', () => {
        expect(sql).toMatch(
          new RegExp(`create function public\\.${fn}\\(p_organizacion uuid, p_desde date, p_hasta date default null\\)`),
        )
        expect(sql).toMatch(/p_hasta is null or/)
      })

      it('revoca a todos y concede solo a service_role sobre la firma de 3 argumentos', () => {
        expect(sql).toMatch(
          new RegExp(`revoke all on function public\\.${fn}\\(uuid, date, date\\) from public, anon, authenticated;`),
        )
        expect(sql).toMatch(
          new RegExp(`grant execute on function public\\.${fn}\\(uuid, date, date\\) to service_role;`),
        )
      })
    })
  }

  it('mantiene stable, language sql y search_path vacío en las dos funciones', () => {
    expect(sql.match(/\bstable\b/g)).toHaveLength(2)
    expect(sql.match(/language sql/g)).toHaveLength(2)
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('agrega a analisis filtros, creado_por y los tokens extra', () => {
    expect(sql).toMatch(/alter table public\.analisis/)
    expect(sql).toMatch(/add column filtros jsonb not null default '\{\}'::jsonb/)
    expect(sql).toMatch(/add column creado_por uuid references auth\.users\(id\) on delete set null/)
    expect(sql).toMatch(/add column tokens_cacheados integer not null default 0/)
    expect(sql).toMatch(/add column tokens_razonamiento integer not null default 0/)
  })
})
