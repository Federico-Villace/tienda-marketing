import { describe, expect, it } from 'vitest'
import { hrefArmarPromocion, leerPrecarga } from './precarga'
import { MARCAS } from '../datos/marcas'

const ZONTES = MARCAS.find((m) => m.nombre === 'Zontes Quilmes')!

const idea = {
  marcaId: ZONTES.id,
  modelo: 'TRK 502',
  tipoPromo: 'cuotas',
  aspecto: '9:16',
  titulo: 'Cuotas en reel',
  momento: 'Viernes a la tarde',
} as const

/** Lo que haría Next con la query: un objeto de strings. */
const query = (href: string) => Object.fromEntries(new URL(href, 'https://x').searchParams)

describe('precarga de /promocionar/nueva desde una idea del Analista', () => {
  it('el link abre el flujo de UNA promoción con todo cargado y marca el origen', () => {
    const href = hrefArmarPromocion(idea)
    expect(href.startsWith('/promocionar/nueva?')).toBe(true)
    expect(query(href)).toMatchObject({ que: 'una', origen: 'analista', marca: ZONTES.id, modelo: 'TRK 502', promo: 'cuotas', aspecto: '9:16' })
  })

  it('ida y vuelta: lo que arma el link es lo que lee la pantalla', () => {
    const p = leerPrecarga(query(hrefArmarPromocion(idea)))
    expect(p).toEqual({
      origen: 'analista',
      marcaIds: [ZONTES.id],
      modelo: 'TRK 502',
      tipo: 'cuotas',
      aspecto: '9:16',
      indicaciones: 'Viernes a la tarde. Cuotas en reel',
    })
  })

  it('sin marca ni modelo (la idea no los trae) el link no los lleva', () => {
    const q = query(hrefArmarPromocion({ ...idea, marcaId: null, modelo: null }))
    expect(q).not.toHaveProperty('marca')
    expect(q).not.toHaveProperty('modelo')
  })

  it('las indicaciones se recortan a 300 caracteres', () => {
    const q = query(hrefArmarPromocion({ ...idea, titulo: 'x'.repeat(500) }))
    expect(q.indicaciones!.length).toBeLessThanOrEqual(300)
  })

  it('es entrada no confiable: lo inválido se ignora, nunca lanza', () => {
    const p = leerPrecarga({ origen: 'analista', marca: 'no-existe', modelo: 'x'.repeat(200), promo: 'gratis', aspecto: '16:9', indicaciones: 'y'.repeat(900) })
    expect(p).toEqual({ origen: 'analista', modelo: 'x'.repeat(60), indicaciones: 'y'.repeat(300) })
  })

  it('sin origen=analista, o sin nada válido, no hay precarga', () => {
    expect(leerPrecarga({ marca: ZONTES.id, modelo: 'TRK' })).toBeNull()
    expect(leerPrecarga({ origen: 'analista', marca: 'no-existe' })).toBeNull()
    expect(leerPrecarga({})).toBeNull()
  })

  it('claves repetidas en la URL (arrays): se toma la primera', () => {
    expect(leerPrecarga({ origen: 'analista', modelo: ['A', 'B'] })).toMatchObject({ modelo: 'A' })
  })
})
