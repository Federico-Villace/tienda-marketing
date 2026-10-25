import { describe, it, expect, vi } from 'vitest'
import { leerMensajes, mensajesDeMarca, type MensajesCuenta } from './mensajes'
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

describe('mensajesDeMarca', () => {
  const filtros = (o: Partial<Filtros> = {}): Filtros => ({
    marcaIds: ['1327958853726987'],
    plataforma: 'todas',
    desde: '2026-07-23',
    hasta: '2026-10-20',
    ...o,
  })
  const fb: MensajesCuenta = { marcaId: '1327958853726987', plataforma: 'facebook', activas: 4, nuevas: 3, mensajes: 17 }
  const ig: MensajesCuenta = { marcaId: '1327958853726987', plataforma: 'instagram', activas: 83, nuevas: null, mensajes: null }
  const otra: MensajesCuenta = { ...fb, marcaId: '999' }

  it('con todas las plataformas devuelve las dos cuentas de la marca', () => {
    expect(mensajesDeMarca([fb, ig, otra], filtros())).toEqual({ facebook: fb, instagram: ig })
  })

  it('con una plataforma devuelve solo esa', () => {
    expect(mensajesDeMarca([fb, ig], filtros({ plataforma: 'instagram' }))).toEqual({ facebook: null, instagram: ig })
    expect(mensajesDeMarca([fb, ig], filtros({ plataforma: 'facebook' }))).toEqual({ facebook: fb, instagram: null })
  })

  it('sin datos de la marca, ambas son null', () => {
    expect(mensajesDeMarca([otra], filtros())).toEqual({ facebook: null, instagram: null })
  })
})
