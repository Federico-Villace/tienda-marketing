import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const NOMBRE = '20261027120000_productor_foto.sql'
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', NOMBRE), 'utf8')
/** Todo lo que está antes del bloque de bajada (comentado) al final. */
const arriba = sql.split('-- BAJADA')[0]!

describe('migración de fotos · tabla fotos', () => {
  it('guarda la foto con sus medidas, límites y la declaración de derechos', () => {
    expect(arriba).toMatch(/create table fotos/)
    expect(arriba).toMatch(/organizacion_id\s+uuid not null references organizaciones\(id\) on delete cascade/)
    // la ruta pasa a null cuando se borra el objeto
    expect(arriba).toMatch(/ruta\s+text,/)
    expect(arriba).toMatch(/mime_type\s+text not null check \(mime_type = 'image\/jpeg'\)/)
    expect(arriba).toMatch(/ancho\s+integer not null check \(ancho between 512 and 2048\)/)
    expect(arriba).toMatch(/alto\s+integer not null check \(alto between 512 and 2048\)/)
    expect(arriba).toMatch(/bytes\s+integer not null check \(bytes between 1 and 4000000\)/)
    expect(arriba).toMatch(/derechos_por\s+uuid not null references auth\.users\(id\) on delete restrict/)
    expect(arriba).toMatch(/derechos_en\s+timestamptz not null/)
    expect(arriba).toMatch(/derechos_version\s+text not null/)
    expect(arriba).toMatch(/borrada_en\s+timestamptz/)
  })

  it('sin ruta solo si está borrada', () => {
    expect(arriba).toMatch(/check \(ruta is not null or borrada_en is not null\)/)
  })

  it('RLS: solo lectura por pertenencia, sin políticas de escritura', () => {
    expect(arriba).toContain('alter table fotos enable row level security')
    expect(arriba).toMatch(/create policy "lectura por pertenencia" on fotos\s+for select using \(es_miembro\(organizacion_id\)\)/)
    expect(arriba).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda URLs firmadas ni claves', () => {
    expect(arriba).not.toMatch(/\b(token|signed|firmada|api_key|secret|password)\b/i)
  })
})

describe('migración de fotos · bucket privado', () => {
  it('crea el bucket fotos privado e idempotente', () => {
    expect(arriba).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s+values \('fotos', 'fotos', false\)\s+on conflict \(id\) do nothing/,
    )
  })

  it('NO crea políticas sobre storage.objects', () => {
    expect(arriba).not.toMatch(/create policy[^;]*storage\.objects/i)
    expect(arriba.replace(/--.*$/gm, '')).not.toMatch(/storage\.objects/)
  })
})

describe('migración de fotos · generaciones y creativos', () => {
  it('generaciones suma foto_id (restrict) y edicion, con sus checks', () => {
    expect(arriba).toMatch(/alter table generaciones[\s\S]*?add column foto_id\s+uuid references fotos\(id\) on delete restrict/)
    expect(arriba).toMatch(/add column edicion\s+text/)
    expect(arriba).toMatch(/add constraint generaciones_un_origen check \(pieza_id is null or foto_id is null\)/)
    expect(arriba).toMatch(/add constraint generaciones_edicion_con_foto check \(\(foto_id is null\) = \(edicion is null\)\)/)
    expect(arriba).toMatch(/create index on generaciones \(foto_id, creado_en desc\)/)
  })

  it('creativos: pieza nullable, foto_id y exactamente un origen', () => {
    expect(arriba).toMatch(/alter table creativos[\s\S]*?alter column pieza_id drop not null/)
    expect(arriba).toMatch(/alter column pieza_raiz_id drop not null/)
    expect(arriba).toMatch(/add column foto_id\s+uuid references fotos\(id\) on delete restrict/)
    expect(arriba).toMatch(/add constraint creativos_un_origen check \(num_nonnulls\(pieza_raiz_id, foto_id\) = 1\)/)
    expect(arriba).toMatch(/add constraint creativos_pieza_completa check \(\(pieza_id is null\) = \(pieza_raiz_id is null\)\)/)
    expect(arriba).toMatch(/add constraint creativos_elegida_de_pieza check \(not elegida or pieza_raiz_id is not null\)/)
    expect(arriba).toMatch(/create index on creativos \(foto_id\)/)
  })
})

describe('migración de fotos · elegir_creativo', () => {
  const m = arriba.match(/create or replace function public\.elegir_creativo\([\s\S]*?\n\$\$;/)
  const f = m?.[0] ?? ''

  it('mantiene la firma y el retorno (create or replace, sin drop)', () => {
    expect(f).toMatch(/create or replace function public\.elegir_creativo\(p_id uuid, p_elegida boolean, p_usuario uuid\)/)
    expect(f).toMatch(/returns public\.creativos/)
    expect(f).toMatch(/set search_path = ''/)
    expect(arriba).not.toMatch(/drop function public\.elegir_creativo/)
  })

  it('una foto no se elige: PT422 antes de bloquear por raíz', () => {
    expect(f).toContain("errcode = 'PT422'")
    expect(f).toMatch(/pieza_raiz_id is null/)
    expect(f.indexOf('PT422')).toBeLessThan(f.indexOf('for update'))
  })

  it('conserva los demás errores y la lógica de una sola elegida', () => {
    expect(f).toContain("errcode = 'PT404'")
    expect(f).toContain("errcode = 'PT409'")
    expect(f.indexOf('elegida = false')).toBeLessThan(f.indexOf('elegida = true'))
  })
})

describe('migración de fotos · permisos', () => {
  it('re-emite revoke y grant solo para service_role', () => {
    expect(arriba).toContain('revoke all on function public.elegir_creativo(uuid, boolean, uuid) from public, anon, authenticated;')
    expect(arriba).toContain('grant execute on function public.elegir_creativo(uuid, boolean, uuid) to service_role;')
    expect(arriba).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('no toca gasto_generaciones_mes ni confirmar_generacion', () => {
    expect(arriba).not.toMatch(/function public\.(gasto_generaciones_mes|confirmar_generacion)/)
  })
})

describe('migración de fotos · bajada', () => {
  it('trae el SQL de bajada comentado, en orden inverso', () => {
    const bajada = sql.split('-- BAJADA')[1] ?? ''
    expect(bajada).toMatch(/-- drop table fotos/)
    expect(bajada).toMatch(/-- delete from storage\.buckets where id = 'fotos'/)
    expect(bajada).toMatch(/-- alter table creativos/)
    expect(bajada.indexOf('alter table creativos')).toBeLessThan(bajada.indexOf('drop table fotos'))
    expect(bajada.split('\n').slice(1).every((l) => l.trim() === '' || l.trim().startsWith('--'))).toBe(true)
  })
})
