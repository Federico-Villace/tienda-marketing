import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoAprobar } from './paso-aprobar'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const largo = 'Este es un texto largo para el posteo. '.repeat(10)
const completa = vistaDePromocion(filaPromocion({ id: 'p1', revision: 6, copy: copyDePrueba({ copy: largo, hashtags: ['#benelli', '#trk502', '#quilmes'] }), plantilla: 'oferta_abajo', escena_creativo_id: 'e', placa_ruta: 'r', placa_hash: 'h' }))
const props = { promocion: completa, marca: { nombre: 'Benelli Store Quilmes', usuarioIg: 'benellistorequilmes' }, placaUrl: 'https://x/final.png', puedeEditar: true }

beforeEach(() => {
  router.push.mockClear()
  router.refresh.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoAprobar> · la vista previa del posteo', () => {
  it('muestra la cuenta, la imagen final, el texto y los hashtags como se va a ver', () => {
    render(<PasoAprobar {...props} />)
    expect(screen.getByText('@benellistorequilmes')).toBeInTheDocument()
    expect(screen.getByAltText(/Imagen del posteo/)).toHaveAttribute('src', 'https://x/final.png')
    expect(screen.getByText('#benelli #trk502 #quilmes')).toBeInTheDocument()
  })

  it('el texto largo se recorta con "más" y se puede abrir completo', () => {
    render(<PasoAprobar {...props} />)
    expect(screen.queryByText(largo.trim(), { exact: false })).toBeNull()
    const mas = screen.getByRole('button', { name: 'más' })
    expect(mas).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(mas)
    expect(screen.getByRole('button', { name: 'menos' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(largo.trim(), { exact: false })).toBeInTheDocument()
  })

  it('un [precio] sin completar se avisa antes de aprobar', () => {
    const conPrecio = { ...completa, copy: copyDePrueba({ copy: 'Hoy a [precio].' }) }
    render(<PasoAprobar {...props} promocion={conPrecio} />)
    expect(screen.getByRole('status')).toHaveTextContent(/\[precio\]/)
  })

  it('sin imagen firmada igual se puede aprobar: el servidor la arma al aprobar', () => {
    render(<PasoAprobar {...props} placaUrl={null} />)
    expect(screen.getByText(/La imagen final se arma al aprobar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeEnabled()
  })
})

describe('<PasoAprobar> · aprobar', () => {
  it('aprueba con la revisión que veía y pasa al paso 6', async () => {
    const f = vi.fn(async () => json({ promocion: { ...completa, estado: 'aprobada', revision: 7 }, aprobacion: { id: 'ap1', version: 1 }, url: 'https://x/final.png' }))
    vi.stubGlobal('fetch', f)
    render(<PasoAprobar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/p1?paso=6'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones/p1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ revision: 6, accion: 'aprobar' })
  })

  it('un doble click manda un solo pedido', async () => {
    const f = vi.fn(async () => json({ promocion: { ...completa, estado: 'aprobada' }, aprobacion: { id: 'ap1', version: 1 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoAprobar {...props} />)
    const b = screen.getByRole('button', { name: 'Aprobar' })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(router.push).toHaveBeenCalled())
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('un 409 dice que otra persona cambió la promoción y ofrece recargar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409)))
    render(<PasoAprobar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('recargá la pantalla')
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(router.refresh).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('un 422 (falta algo o el texto no entra) se muestra en castellano', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'El texto del titular es muy largo para este diseño.' }, 422)))
    render(<PasoAprobar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('muy largo para este diseño')
  })

  it('"Volver a editar" lleva al paso 4 sin llamar al servidor', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoAprobar {...props} />)
    expect(screen.getByRole('link', { name: 'Volver a editar' })).toHaveAttribute('href', '/promocionar/p1?paso=4')
    expect(f).not.toHaveBeenCalled()
  })

  it('un lector solo mira: sin aprobar ni descartar', () => {
    render(<PasoAprobar {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull()
  })
})

describe('<PasoAprobar> · descartar y reabrir', () => {
  it('descartar pide una confirmación aparte y vuelve a la lista', async () => {
    const f = vi.fn(async () => json({ promocion: { ...completa, estado: 'descartada' } }))
    vi.stubGlobal('fetch', f)
    render(<PasoAprobar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar promoción' }))
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar'))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 6, accion: 'descartar' })
  })

  it('una promoción ya aprobada ofrece ver el resultado o volver a editar', async () => {
    const f = vi.fn(async () => json({ promocion: { ...completa, estado: 'borrador', revision: 8 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoAprobar {...props} promocion={{ ...completa, estado: 'aprobada' }} />)
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(screen.getByRole('link', { name: /Ver el resultado/ })).toHaveAttribute('href', '/promocionar/p1?paso=6')
    fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/p1?paso=4'))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 6, accion: 'reabrir' })
  })
})
