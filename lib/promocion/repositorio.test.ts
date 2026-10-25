import { describe, it, expect, vi } from 'vitest'
import { editarPromocion, leerPromocion } from './repositorio'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { filaPromocion, ID_PROMO } from './fixture'

const s = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

describe('leerPromocion', () => {
  it('lee por id y organización', async () => {
    const f = vi.fn<typeof fetch>(async () => json([filaPromocion()]))
    expect((await leerPromocion(s, ID_PROMO, f))?.id).toBe('p1')
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.pathname).toBe('/rest/v1/promociones')
    expect(url.searchParams.get('id')).toBe(`eq.${ID_PROMO}`)
    expect(url.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })
  it('devuelve undefined si no existe', async () => {
    expect(await leerPromocion(s, ID_PROMO, async () => json([]))).toBeUndefined()
  })
})

describe('editarPromocion', () => {
  const rpcs: any[] = []
  const mundo = (respuestas: Response[], actual = filaPromocion({ revision: 2 })) => {
    rpcs.length = 0
    return vi.fn<typeof fetch>(async (u, init) => {
      const url = new URL(String(u))
      if (url.pathname.includes('/rpc/')) {
        rpcs.push(JSON.parse(String(init!.body)))
        return respuestas.shift()!
      }
      return json([actual])
    })
  }

  it('llama a editar_promocion con la revisión y el usuario', async () => {
    const f = mundo([json(filaPromocion({ revision: 2, textos_id: 't1' }))])
    const r = await editarPromocion(s, filaPromocion(), { textos_id: 't1' }, 'u-1', f)
    expect(r.textos_id).toBe('t1')
    expect(rpcs).toEqual([{ p_id: 'p1', p_revision: 1, p_campos: { textos_id: 't1' }, p_usuario: 'u-1' }])
  })
  it('si cambió mientras tanto (409), relee y reintenta una vez con la revisión nueva', async () => {
    const f = mundo([json({ message: 'cambió' }, 409), json(filaPromocion({ revision: 3 }))])
    const r = await editarPromocion(s, filaPromocion(), { textos_id: 't1' }, 'u-1', f)
    expect(r.revision).toBe(3)
    expect(rpcs.map((x) => x.p_revision)).toEqual([1, 2])
  })
  it('si el segundo intento también choca, el error sube', async () => {
    const f = mundo([json({ message: 'cambió' }, 409), json({ message: 'cambió' }, 409)])
    await expect(editarPromocion(s, filaPromocion(), { textos_id: 't1' }, 'u-1', f)).rejects.toThrow()
  })
  it('si ya no es un borrador no reintenta', async () => {
    const f = mundo([json({ message: 'cambió' }, 409)], filaPromocion({ revision: 2, estado: 'aprobada' }))
    await expect(editarPromocion(s, filaPromocion(), { textos_id: 't1' }, 'u-1', f)).rejects.toThrow()
    expect(rpcs).toHaveLength(1)
  })
  it('un error que no es 409 sube sin reintentar', async () => {
    const f = mundo([json({ message: 'boom' }, 500)])
    await expect(editarPromocion(s, filaPromocion(), { textos_id: 't1' }, 'u-1', f)).rejects.toThrow()
    expect(rpcs).toHaveLength(1)
  })
})
