import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020180000_clics_en_metricas_y_resumen_publicaciones.sql'),
  'utf8',
)

describe('migración de clics en métricas de publicación', () => {
  it('agrega clics integer nullable (sin not null: IG no lo informa)', () => {
    expect(sql).toMatch(/alter table public\.metricas_publicacion\s+add column clics integer;/)
    expect(sql).not.toMatch(/clics integer[^;]*not null/i)
  })

  it('recrea resumen_publicaciones devolviendo alcance, clics y permalink', () => {
    // El tipo de retorno cambia: create or replace solo no alcanza, hay que dropear.
    expect(sql).toMatch(/drop function if exists public\.resumen_publicaciones\(uuid, date\);/)
    expect(sql).toMatch(/create function public\.resumen_publicaciones\(p_organizacion uuid, p_desde date\)/)
    expect(sql).toMatch(/\bpermalink\s+text/)
    expect(sql).toMatch(/\balcance\s+integer/)
    expect(sql).toMatch(/\bclics\s+integer/)
    expect(sql).toMatch(/m\.clics/)
  })

  it('mantiene la seguridad: stable, search_path vacío, solo service_role', () => {
    expect(sql).toMatch(/\bstable\b/)
    expect(sql).toMatch(/set search_path = ''/)
    expect(sql).toMatch(/language sql/)
    expect(sql).toMatch(
      /revoke all on function public\.resumen_publicaciones\(uuid, date\) from public, anon, authenticated;/,
    )
    expect(sql).toMatch(/grant execute on function public\.resumen_publicaciones\(uuid, date\) to service_role;/)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
})
