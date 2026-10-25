import { describe, it, expect, vi } from 'vitest'
import { leerMensajes, mensajesDeMarcas, type MensajesCuenta } from './mensajes'
import type { Filtros } from './filtros'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200 })

const fila = (o: Record<string, unknown> = {}) => ({
  cuenta_id: 'u1',
  tipo: 'facebook',
  meta_id: '1327958853726987',
  conversaciones_activas: '4',
  conversaciones_nuevas: '3',
  mensajes: '17',
  dias: 30,
  ...o,
})

describe('leerMensajes', () => {
  it('invoca la RPC con la organización, el desde y, si hay, el hasta', async () => {
    const f = vi.fn<typeof fetch>(async () => json([]))
    await leerMensajes(s, 'org-1', '2026-07-23', f)
    expect(String(f.mock.calls[0]![0])).toContain('/rpc/resumen_mensajes')
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body))).toEqual({ p_organizacion: 'org-1', p_desde: '2026-07-23' })
    await leerMensajes(s, 'org-1', '2026-07-23', f, '2026-08-01')
    expect(JSON.parse(String(f.mock.calls[1]![1]?.body))).toEqual({
      p_organizacion: 'org-1',
      p_desde: '2026-07-23',
      p_hasta: '2026-08-01',
    })
  })

  it('resuelve la marca por el id de la página o del IG, convierte bigint a número y conserva null', async () => {
    const f = vi.fn<typeof fetch>(async () =>
      json([
        fila(),
        fila({ cuenta_id: 'u2', tipo: 'instagram', meta_id: '17841436179087906', conversaciones_activas: 83, conversaciones_nuevas: null, mensajes: null }),
      ]),
    )
    const r = await leerMensajes(s, 'org-1', '2026-07-23', f)
    expect(r).toEqual([
      { marcaId: '1327958853726987', plataforma: 'facebook', activas: 4, nuevas: 3, mensajes: 17 },
      { marcaId: '1327958853726987', plataforma: 'instagram', activas: 83, nuevas: null, mensajes: null },
    ])
  })

  it('descarta las cuentas que no son de ninguna marca (ad_account, desconocidas)', async () => {
    const f = vi.fn<typeof fetch>(async () => json([fila({ meta_id: 'desconocida' }), fila({ tipo: 'ad_account' })]))
    expect(await leerMensajes(s, 'org-1', '2026-07-23', f)).toEqual([])
  })
})

describe('mensajesDeMarcas', () => {
  const A = '100206789578448' // Suzuki
  const B = '1327958853726987' // Zontes
  const cuenta = (marcaId: string, plataforma: 'facebook' | 'instagram', activas: number | null, nuevas: number | null = null, mensajes: number | null = null): MensajesCuenta => ({
    marcaId,
    plataforma,
    activas,
    nuevas,
    mensajes,
  })
  const sel = (o: Partial<{ marcaIds: readonly string[]; plataforma: 'todas' | 'instagram' | 'facebook' }> = {}) => ({
    marcaIds: [A, B],
    plataforma: 'todas' as const,
    ...o,
  })

  it('una fila por marca elegida y el total sumado', () => {
    const r = mensajesDeMarcas(
      [cuenta(A, 'facebook', 4, 3, 17), cuenta(A, 'instagram', 83), cuenta(B, 'facebook', 6, 2, 10), cuenta(B, 'instagram', 7), cuenta('999', 'facebook', 999)],
      sel(),
    )
    expect(r.porMarca.map((m) => m.marcaId)).toEqual([A, B])
    expect(r.porMarca[0]!.facebook?.activas).toBe(4)
    expect(r.total.facebook).toEqual({ activas: 10, nuevas: 5, mensajes: 27 })
    expect(r.total.instagram).toEqual({ activas: 90, nuevas: null, mensajes: null })
  })

  it('suma solo lo informado: null si ninguna marca lo informa, nunca un 0 inventado', () => {
    const r = mensajesDeMarcas([cuenta(A, 'facebook', 4, null, 17), cuenta(B, 'facebook', null, null, null)], sel())
    expect(r.total.facebook).toEqual({ activas: 4, nuevas: null, mensajes: 17 })
    expect(r.total.instagram).toBeNull()
  })

  it('respeta el filtro de plataforma', () => {
    const r = mensajesDeMarcas([cuenta(A, 'facebook', 4), cuenta(A, 'instagram', 8)], sel({ plataforma: 'instagram' }))
    expect(r.porMarca[0]).toMatchObject({ facebook: null })
    expect(r.total.facebook).toBeNull()
    expect(r.total.instagram?.activas).toBe(8)
  })

  it('una marca sin datos aparece igual, con null', () => {
    const r = mensajesDeMarcas([cuenta(A, 'facebook', 4)], sel())
    expect(r.porMarca[1]).toEqual({ marcaId: B, facebook: null, instagram: null })
  })
})
