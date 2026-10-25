import { describe, it, expect, vi } from 'vitest'
import { filasDeComparacion, leerComparacionPromocion, leerResumenPromocion } from './promocion'
import { MARCAS } from './marcas'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const params = { cuentas: ['100', '200'], marca: 'benelli', modelo: 'TRK 502', desde: '2026-07-28', hasta: '2026-10-25' }

describe('leerResumenPromocion', () => {
  it('llama a resumen_promocion con los argumentos de la RPC y nada más', async () => {
    const f = vi.fn<typeof fetch>(async () => json({}))
    await leerResumenPromocion(s, 'org-1', params, f)
    const [u, init] = f.mock.calls[0]!
    expect(new URL(String(u)).pathname).toBe('/rest/v1/rpc/resumen_promocion')
    expect(JSON.parse(String(init!.body))).toEqual({
      p_org: 'org-1',
      p_cuentas: ['100', '200'],
      p_marca: 'benelli',
      p_modelo: 'TRK 502',
      p_desde: '2026-07-28',
      p_hasta: '2026-10-25',
    })
  })

  it('devuelve lo que calculó Postgres', async () => {
    const resumen = {
      modeloFiltrable: true,
      publicaciones: 12,
      organico: [{ mencionaModelo: true, plataforma: 'instagram', tipo: 'REELS', publicaciones: 3, vistas: 1500, interaccionesPromedio: 40.5, comentariosPromedio: 2, tasaInteraccion: 0.08 }],
      porPromo: [{ promo: 'cuotas', publicaciones: 4, vistas: 2000, interaccionesPromedio: 30, tasaInteraccion: 0.06 }],
      mejores: [{ fecha: '2026-10-03', plataforma: 'instagram', tipo: 'REELS', mencionaModelo: true, texto: 'TRK 502', vistas: 900, interacciones: 80 }],
      campanias: { totales: { campanias: 1, gasto: 1500.5, impresiones: 10000, clics: 100, resultados: 10 }, top: [] },
    }
    const r = await leerResumenPromocion(s, 'org-1', params, async () => json(resumen))
    expect(r).toEqual(resumen)
  })

  it('una respuesta vacía o rota queda en ceros: nunca revienta', async () => {
    const r = await leerResumenPromocion(s, 'org-1', params, async () => json(null))
    expect(r.publicaciones).toBe(0)
    expect(r.organico).toEqual([])
    expect(r.campanias.top).toEqual([])
    expect(r.campanias.totales.campanias).toBe(0)
    expect(r.modeloFiltrable).toBe(false)
  })

  it('un error de la base se propaga', async () => {
    await expect(leerResumenPromocion(s, 'org-1', params, async () => json({ message: 'boom' }, 500))).rejects.toThrow()
  })
})

describe('leerComparacionPromocion', () => {
  const [suzuki, zontes] = [MARCAS[2]!, MARCAS[5]!]
  const parametros = { marcaIds: [zontes.id, suzuki.id], modelos: ['TRK 502', 'Leoncino'], desde: '2026-07-28', hasta: '2026-10-25' }
  const resumenDe = (n: number) => ({ modeloFiltrable: true, publicaciones: n, organico: [], porPromo: [], mejores: [], campanias: { totales: { campanias: 0, gasto: 0, impresiones: 0, clics: 0, resultados: 0 }, top: [] } })

  it('llama UNA vez a resumen_promocion_comparado con un grupo por marca (en orden de MARCAS) y los modelos', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    await leerComparacionPromocion(s, 'org-1', parametros, f)
    expect(f).toHaveBeenCalledTimes(1)
    const [u, init] = f.mock.calls[0]!
    expect(new URL(String(u)).pathname).toBe('/rest/v1/rpc/resumen_promocion_comparado')
    expect(JSON.parse(String(init!.body))).toEqual({
      p_org: 'org-1',
      p_grupos: [
        { clave: suzuki.id, cuentas: [suzuki.id, suzuki.igId], token: 'suzuki' },
        { clave: zontes.id, cuentas: [zontes.id, zontes.igId], token: 'zontes' },
      ],
      p_modelos: ['TRK 502', 'Leoncino'],
      p_desde: '2026-07-28',
      p_hasta: '2026-10-25',
    })
  })

  it('devuelve marca, modelo y el resumen que sumó Postgres', async () => {
    const f = async () => json([{ clave: suzuki.id, modelo: 'TRK 502', resumen: resumenDe(4) }, { clave: zontes.id, modelo: 'TRK 502', resumen: resumenDe(0) }])
    const r = await leerComparacionPromocion(s, 'org-1', { ...parametros, modelos: ['TRK 502'] }, f)
    expect(r.map((x) => [x.marcaId, x.modelo, x.resumen.publicaciones])).toEqual([[suzuki.id, 'TRK 502', 4], [zontes.id, 'TRK 502', 0]])
  })

  it('una respuesta nula o con filas rotas queda vacía / en ceros: nunca revienta', async () => {
    expect(await leerComparacionPromocion(s, 'org-1', parametros, async () => json(null))).toEqual([])
    const r = await leerComparacionPromocion(s, 'org-1', parametros, async () => json([{ clave: suzuki.id, modelo: 'x', resumen: null }, { clave: 'desconocida', modelo: 'x', resumen: resumenDe(1) }]))
    expect(r).toHaveLength(1)
    expect(r[0]!.resumen.publicaciones).toBe(0)
  })

  it('no llama a Postgres con 0 marcas, más de 7 o 4 modelos (ni hace falta)', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    expect(await leerComparacionPromocion(s, 'org-1', { ...parametros, marcaIds: [] }, f)).toEqual([])
    expect(await leerComparacionPromocion(s, 'org-1', { ...parametros, modelos: [] }, f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
    await leerComparacionPromocion(s, 'org-1', { ...parametros, modelos: ['a', 'b', 'c', 'd'] }, f)
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body)).p_modelos).toEqual(['a', 'b', 'c'])
  })

  it('un error de la base se propaga', async () => {
    await expect(leerComparacionPromocion(s, 'org-1', parametros, async () => json({ message: 'boom' }, 500))).rejects.toThrow()
  })
})

describe('filasDeComparacion', () => {
  const resumen = {
    modeloFiltrable: true,
    publicaciones: 10,
    organico: [
      { mencionaModelo: true, plataforma: 'instagram', tipo: 'REELS', publicaciones: 2, vistas: 1000, interaccionesPromedio: 50, comentariosPromedio: 1, tasaInteraccion: 0.1 },
      { mencionaModelo: false, plataforma: 'facebook', tipo: 'IMAGE', publicaciones: 8, vistas: 3000, interaccionesPromedio: 25, comentariosPromedio: 1, tasaInteraccion: 0.0667 },
    ],
    porPromo: [],
    mejores: [],
    campanias: { totales: { campanias: 2, gasto: 1234.567, impresiones: 1, clics: 1, resultados: 1 }, top: [] },
  }

  it('resume cada marca × modelo con nombre de marca (no id)', () => {
    const [fila] = filasDeComparacion([{ marcaId: MARCAS[5]!.id, modelo: 'TRK 502', resumen }])
    expect(fila).toEqual({
      marca: 'Zontes Quilmes',
      modelo: 'TRK 502',
      publicaciones: 10,
      vistasPromedio: 400,
      tasaInteraccionPct: 7.5,
      mencionanModelo: 2,
      gastoAtribuido: 1234.57,
    })
  })

  it('sin publicaciones: vistas en 0 y tasa null, nunca NaN', () => {
    const vacio = { ...resumen, publicaciones: 0, organico: [], campanias: { ...resumen.campanias, totales: { ...resumen.campanias.totales, gasto: 0 } } }
    const [fila] = filasDeComparacion([{ marcaId: MARCAS[0]!.id, modelo: 'x', resumen: vacio }])
    expect(fila).toMatchObject({ publicaciones: 0, vistasPromedio: 0, tasaInteraccionPct: null, mencionanModelo: 0, gastoAtribuido: 0 })
  })
})
