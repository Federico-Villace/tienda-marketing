import { describe, it, expect, vi } from 'vitest'
import { leerResumenPromocion } from './promocion'

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
