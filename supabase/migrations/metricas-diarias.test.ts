import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020120000_metricas_diarias_y_resumen_publicaciones.sql'),
  'utf8',
)

describe('migración de métricas diarias y resumen de publicaciones', () => {
  it('una foto por publicación y día: unique (publicacion_id, fecha)', () => {
    expect(sql).toMatch(/unique\s*\(publicacion_id,\s*fecha\)/)
    expect(sql).toMatch(/fecha\s+date/i)
    expect(sql).toContain("America/Argentina/Buenos_Aires")
  })

  it('resumen_publicaciones es stable y no depende del search_path', () => {
    expect(sql).toMatch(/function public\.resumen_publicaciones\(p_organizacion uuid, p_desde date\)/)
    expect(sql).toMatch(/\bstable\b/)
    expect(sql).toMatch(/set search_path = ''/)
  })

  it('solo service_role puede ejecutarla', () => {
    expect(sql).toMatch(
      /revoke all on function public\.resumen_publicaciones\(uuid, date\) from public, anon, authenticated;/,
    )
    expect(sql).toMatch(/grant execute on function public\.resumen_publicaciones\(uuid, date\) to service_role;/)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
})
