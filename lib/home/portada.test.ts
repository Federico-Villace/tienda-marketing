import { describe, it, expect, vi } from 'vitest'
import { cargarPortada, placaFija } from './portada'

const env = (o: Record<string, string | undefined> = {}) => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x', ...o })
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const ahora = new Date('2026-11-04T15:00:00Z')

/** Responde según la URL; lo que no está en `rutas` devuelve [] (sin datos). */
const mundo = (rutas: Record<string, unknown> = {}) =>
  vi.fn<typeof fetch>(async (u) => {
    const url = String(u)
    const hit = Object.keys(rutas).find((k) => url.includes(k))
    return json(hit ? rutas[hit] : [])
  })

describe('cargarPortada · placa', () => {
  it('con HOME_PLACA_FIJA usa esa imagen y no consulta promociones aprobadas', async () => {
    const f = mundo()
    const p = await cargarPortada(env({ HOME_PLACA_FIJA: '/home/ejemplo.png' }), f, ahora)
    expect(p.placa).toMatchObject({ tipo: 'fija', url: '/home/ejemplo.png', pie: 'Ejemplo hecho con la app' })
    expect(f.mock.calls.some(([u]) => String(u).includes('estado=eq.aprobada'))).toBe(false)
  })

  it('HOME_PLACA_FIJA que no es una ruta propia se ignora', () => {
    for (const v of ['https://malo.com/x.png', '//malo.com/x.png', 'javascript:alert(1)', 'relativa.png', '']) {
      expect(placaFija({ HOME_PLACA_FIJA: v })).toBeNull()
    }
  })

  it('sin promociones aprobadas no hay placa (la tarjeta queda sin imagen)', async () => {
    expect((await cargarPortada(env(), mundo(), ahora)).placa).toBeNull()
  })

  it('con una aprobada, firma su placa y enlaza a la promoción', async () => {
    const f = mundo({
      'estado=eq.aprobada': [{ id: 'p-1', marca_id: '999motos', modelo: 'TRK 502', placa_ruta: 'placas/x.png' }],
      '/object/sign/': [{ path: 'placas/x.png', signedURL: '/object/sign/creativos/placas/x.png?token=t' }],
    })
    const { placa } = await cargarPortada(env(), f, ahora)
    expect(placa).toMatchObject({ tipo: 'aprobada', href: '/promocionar/p-1' })
    expect(placa?.pie).toContain('TRK 502')
  })
})

describe('cargarPortada · pendientes', () => {
  it('sin borradores es 0', async () => {
    expect((await cargarPortada(env(), mundo(), ahora)).pendientes).toBe(0)
  })
  it('una tanda cuenta una sola vez', async () => {
    const f = mundo({
      'estado=eq.borrador': [
        { id: 'a', tanda_id: 't' },
        { id: 'b', tanda_id: 't' },
        { id: 'c', tanda_id: null },
      ],
    })
    expect((await cargarPortada(env(), f, ahora)).pendientes).toBe(2)
  })
})

describe('cargarPortada · resultados', () => {
  const fila = (id: string, vistas: number) => ({
    publicacion_id: id,
    cuenta_meta_id: '1327958853726987',
    plataforma: 'facebook',
    tipo: 'video',
    texto: id,
    permalink: `https://fb/${id}`,
    publicado_en: '2026-10-20T15:00:00+00:00',
    vistas,
    me_gusta: 1,
    comentarios: 0,
    compartidos: 0,
    guardados: 0,
  })

  it('el mejor post nunca es uno fuera de lo normal (más de 20× lo habitual de su cuenta)', async () => {
    const normales = [1000, 1000, 1000, 1000, 1000, 3000].map((v, i) => fila(`n${i}`, v))
    const f = mundo({ resumen_publicaciones: [...normales, fila('boost', 907_000)] })
    const { resultados } = await cargarPortada(env(), f, ahora)
    expect(resultados?.mejor?.publicacion.id).toBe('n5')
  })
})

describe('cargarPortada · si todo falla no rompe', () => {
  it('la base caída deja la portada vacía, sin lanzar', async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new Error('red caída')
    })
    await expect(cargarPortada(env(), f, ahora)).resolves.toEqual({ placa: null, resultados: null, pendientes: 0 })
  })
  it('sin variables de Supabase tampoco', async () => {
    await expect(cargarPortada({}, mundo(), ahora)).resolves.toEqual({ placa: null, resultados: null, pendientes: 0 })
  })
})
