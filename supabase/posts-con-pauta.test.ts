import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261106120000_posts_con_pauta.sql'), 'utf8')

/** El SQL sin las líneas de comentario (la bajada comentada no cuenta). */
const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

const funcion = (nombre: string) => {
  const m = sinComentarios.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración posts-con-pauta · tabla anuncios', () => {
  it('lleva organizacion_id, cuenta, ids de Meta y el crudo not null', () => {
    expect(sinComentarios).toMatch(/create table public\.anuncios/)
    expect(sinComentarios).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(sinComentarios).toMatch(/cuenta_id\s+uuid not null references public\.cuentas_meta\(id\) on delete cascade/)
    expect(sinComentarios).toMatch(/meta_ad_id\s+text not null/)
    expect(sinComentarios).toMatch(/story_id\s+text/)
    expect(sinComentarios).toMatch(/instagram_media_id\s+text/)
    expect(sinComentarios).toMatch(/crudo\s+jsonb not null/)
  })

  it('un anuncio es único por cuenta y se indexa por story e instagram', () => {
    expect(sinComentarios).toMatch(/unique \(cuenta_id, meta_ad_id\)/)
    expect(sinComentarios).toMatch(/create index on public\.anuncios \(organizacion_id, story_id\)/)
    expect(sinComentarios).toMatch(/create index on public\.anuncios \(organizacion_id, instagram_media_id\)/)
  })

  it('RLS: solo lectura por pertenencia, sin políticas de escritura', () => {
    expect(sinComentarios).toContain('alter table public.anuncios enable row level security')
    expect(sinComentarios).toMatch(/create policy "lectura por pertenencia" on public\.anuncios\s+for select using \(public\.es_miembro\(organizacion_id\)\)/)
    expect(sinComentarios).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda tokens', () => {
    expect(sinComentarios).not.toMatch(/\b(token|secret|password|api_key)\b/i)
  })
})

describe('migración posts-con-pauta · resumen_publicaciones', () => {
  it('dropea la firma vigente (uuid, date, date) y la recrea', () => {
    expect(sinComentarios).toMatch(/drop function if exists public\.resumen_publicaciones\(uuid, date, date\)/)
    expect(sinComentarios).toMatch(/create function public\.resumen_publicaciones\(p_organizacion uuid, p_desde date, p_hasta date default null\)/)
  })

  it('devuelve con_pauta y campania_pauta al final, sin perder las columnas anteriores', () => {
    const f = funcion('resumen_publicaciones')
    for (const c of ['publicacion_id', 'cuenta_meta_id', 'plataforma', 'tipo', 'texto', 'permalink', 'publicado_en', 'vistas', 'alcance', 'clics', 'me_gusta', 'comentarios', 'compartidos', 'guardados', 'fecha_metrica']) {
      expect(f).toMatch(new RegExp(`\\b${c}\\b`))
    }
    expect(f).toMatch(/fecha_metrica\s+date,\s+con_pauta\s+boolean,\s+campania_pauta\s+text\s+\)/)
  })

  it('cuenta como pauta cualquier anuncio de la organización que no sea DISAPPROVED', () => {
    const f = funcion('resumen_publicaciones')
    expect(f).toMatch(/a\.organizacion_id = p\.organizacion_id/)
    expect(f).toMatch(/a\.estado is distinct from 'DISAPPROVED'/)
  })

  it('el match es por plataforma: Facebook por story_id, Instagram por instagram_media_id', () => {
    const f = funcion('resumen_publicaciones')
    expect(f).toMatch(/p\.plataforma = 'facebook' and a\.story_id = p\.meta_post_id/)
    expect(f).toMatch(/p\.plataforma = 'instagram' and a\.instagram_media_id = p\.meta_post_id/)
  })

  it('la campaña sale del anuncio más reciente', () => {
    const f = funcion('resumen_publicaciones')
    expect(f).toMatch(/order by a\.creado_en_meta desc nulls last/)
  })

  it('sigue filtrando por organización y período', () => {
    const f = funcion('resumen_publicaciones')
    expect(f).toMatch(/p\.organizacion_id = p_organizacion/)
    expect(f).toMatch(/America\/Argentina\/Buenos_Aires/)
  })
})

describe('migración posts-con-pauta · permisos', () => {
  it('la RPC recreada pierde los permisos y solo service_role los recupera', () => {
    expect(sinComentarios).toMatch(/revoke all on function public\.resumen_publicaciones\(uuid, date, date\) from public, anon, authenticated/)
    expect(sinComentarios).toMatch(/grant execute on function public\.resumen_publicaciones\(uuid, date, date\) to service_role/)
    expect(sinComentarios).not.toMatch(/grant [^;]*\b(anon|authenticated)\b/i)
  })
})
