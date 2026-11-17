import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const archivo = '20261119120000_copia_fiel_en_lotes.sql'
const leer = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8')
const sql = leer(archivo)
const lotes = leer('20261101120000_placas_en_lote.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const activo = sinComentarios(sql)

const funcion = (nombre: string, src = sql) => {
  const m = src.match(new RegExp(`create (?:or replace )?function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración copia-fiel-en-lotes · constraint', () => {
  it('el timestamp es posterior a la migración de la copia fiel (20261118120000)', () => {
    expect(Number(archivo.slice(0, 14))).toBeGreaterThan(20261118120000)
  })
  it('saca SOLO el check que prohibía la copia fiel en un lote, y no toca el que exige las tres columnas juntas', () => {
    expect(activo).toMatch(/alter table public\.generaciones\s+drop constraint generaciones_copia_sin_lote/)
    expect(activo).not.toMatch(/drop constraint generaciones_copia_completa/)
  })
  it('es aditiva: no borra tablas ni columnas', () => {
    expect(activo).not.toMatch(/drop table|drop column/i)
  })
})

describe('migración copia-fiel-en-lotes · crear_lote_generacion', () => {
  const f = funcion('crear_lote_generacion')
  it('conserva la firma de siempre (create or replace, mismos seis parámetros)', () => {
    expect(f).toMatch(/^create or replace function public\.crear_lote_generacion\(\s*p_org uuid, p_tanda uuid, p_promocion uuid, p_items jsonb, p_vence timestamptz, p_usuario uuid\s*\)/)
  })
  it('guarda los textos esperados, su hash y el modelo que verifica de cada ítem', () => {
    expect(f).toMatch(/textos_esperados, textos_hash, modelo_verificacion/)
    expect(f).toMatch(/i->'textosEsperados'/)
    expect(f).toMatch(/i->>'textosHash'/)
    expect(f).toMatch(/i->>'modeloVerificacion'/)
  })
  it('devuelve el hash de cada ítem: el orden de las filas no alcanza para reconocerlas (varias del mismo grupo)', () => {
    expect(f).toMatch(/'textosHash', g\.textos_hash/)
  })
  it('sigue siendo todo o nada, de 1 a 10 imágenes, de una tanda O de una promoción', () => {
    expect(f).toMatch(/v_ni < 1 or v_ni > 10/)
    expect(f).toMatch(/\(p_tanda is null\) = \(p_promocion is null\)/)
  })
  it('conserva lo que ya guardaba (grupo, lote, referencia, versión del prompt y costo)', () => {
    for (const c of ['referencia_foto_id', 'grupo', 'lote_id', 'version_prompt', 'costo_estimado_usd', 'vence_en']) expect(f).toContain(c)
  })
  it('no suma el costo de la revisión aparte: el estimado de cada ítem ya la incluye (lo calcula el backend)', () => {
    expect(f).toMatch(/sum\(\(i->>'costoEstimadoUsd'\)::numeric\)/)
  })
  it('los grants: solo service_role', () => {
    expect(activo).toMatch(/revoke all on function public\.crear_lote_generacion\(uuid, uuid, uuid, jsonb, timestamptz, uuid\) from public, anon, authenticated/)
    expect(activo).toMatch(/grant execute on function public\.crear_lote_generacion\(uuid, uuid, uuid, jsonb, timestamptz, uuid\) to service_role/)
  })
  it('lo demás del lote (confirmar, iniciar, liberar) NO se toca: la compuerta es la misma', () => {
    for (const n of ['confirmar_lote_generacion', 'iniciar_generacion_lote', 'liberar_generaciones_lote', 'confirmar_generacion']) expect(activo).not.toContain(`function public.${n}`)
  })
  it('es la misma función de antes con las columnas nuevas: lo que ya insertaba sigue igual', () => {
    const antes = funcion('crear_lote_generacion', lotes)
    for (const trozo of ["'El lote es de una tanda o de una promoción'", "'Un lote lleva de 1 a 10 imágenes'", "'La tanda o la promoción no existe'"]) {
      expect(antes).toContain(trozo)
      expect(f).toContain(trozo)
    }
  })
})

describe('migración copia-fiel-en-lotes · bajada', () => {
  it('tiene la bajada comentada (volver a poner el check; solo si no hay copias en lotes)', () => {
    expect(sql).toMatch(/-- alter table public\.generaciones add constraint generaciones_copia_sin_lote check \(lote_id is null or textos_esperados is null\)/)
  })
})
