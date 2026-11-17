import { describe, it, expect, vi } from 'vitest'
import { HEADER_USUARIO } from '../auth/acceso'
import { manejarEstimacion } from './estimacion'
import { filaPromocion, ID_FOTO, ID_PROMO } from '../promocion/fixture'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz', GEMINI_API_KEY: 'AIza-SECRETISIMA-1234', PRESUPUESTO_MENSUAL_USD: '10' }
const extra = { fotoId: '22222222-2222-4222-8222-222222222222', modelo: 'MOTO 2', precio: { moneda: 'ARS', monto: 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' } }

describe('estimar la imagen de una grilla de motos', () => {
  it('no hay nada para estimar: la grilla no usa IA ni cuesta (422), sin insertar ni llamar a Gemini', async () => {
    const inserts: unknown[] = []
    const f = vi.fn<typeof fetch>(async (u, init) => {
      const url = new URL(String(u))
      if (url.hostname.includes('googleapis')) throw new Error('Gemini no se llama')
      if (url.pathname === '/rest/v1/miembros') return Response.json([{ rol: 'director' }])
      if (url.pathname === '/rest/v1/promociones') return Response.json([filaPromocion({ id: ID_PROMO, foto_id: ID_FOTO, plantilla: 'varias_motos', motos_extra: [extra] } as never)])
      if (init?.method === 'POST') inserts.push(1)
      throw new Error(`URL inesperada: ${url}`)
    })
    const r = await manejarEstimacion(
      new Request('https://app.ejemplo.com/api/generaciones', { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_USUARIO]: 'u-1' }, body: JSON.stringify({ promocionId: ID_PROMO, cantidad: 1 }) }),
      entorno,
      f,
    )
    expect(r.status).toBe(422)
    expect(((await r.json()) as { error: string }).error).toMatch(/grilla/i)
    expect(inserts).toHaveLength(0)
  })
})
