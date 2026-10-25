import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoAntecedentes } from './paso-antecedentes'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { filaPromocion } from '@/lib/promocion/fixture'
import type { AnalisisVista } from '@/lib/analista/historial'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const promo = vistaDePromocion(filaPromocion({ id: 'p1', revision: 2 }))
const analisis = (o: Partial<AnalisisVista> = {}): AnalisisVista => ({
  id: 'a1', contenido: 'Qué funcionó: los reels.\nRecomendaciones: publicá a la tarde.', original: 'Qué funcionó: los reels.', version: 1, editadoEn: null, editadoPor: null,
  versiones: [{ version: 1, fecha: '2026-10-25T10:00:00+00:00', autor: null }], modelo: 'gpt-6-luna', costoUsd: 0.0021, tokensEntrada: 1, tokensSalida: 1, creadoEn: '2026-10-25T10:00:00+00:00',
  filtros: {} as never, desdeCache: false, ...o,
})
const props = { promocion: promo, analisis: null, marca: 'Benelli Store Quilmes', habilitado: true, puedeEditar: true, costo: '~US$ 0,002' }

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoAntecedentes> · antes de revisar', () => {
  it('el botón dice qué hace y cuánto cuesta, y hay una salida sin gastar', () => {
    render(<PasoAntecedentes {...props} />)
    expect(screen.getByRole('button', { name: 'Revisar cómo nos fue · ~US$ 0,002' })).toBeEnabled()
    expect(screen.getByRole('link', { name: /Seguir sin revisar/ })).toHaveAttribute('href', '/promocionar/p1?paso=3')
    expect(screen.getByText(/Benelli Store Quilmes/)).toBeInTheDocument()
  })

  it('llama al servidor sin precio ni cuerpo y muestra el análisis', async () => {
    const f = vi.fn(async () => json({ analisis: analisis(), desdeCache: false, promocion: { ...promo, analisisId: 'a1' } }))
    vi.stubGlobal('fetch', f)
    render(<PasoAntecedentes {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar cómo nos fue/ }))
    expect(await screen.findByText(/Qué funcionó: los reels\./)).toBeInTheDocument()
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('/api/promociones/p1/antecedentes')
    expect(router.refresh).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Seguir a los textos/ })).toHaveAttribute('href', '/promocionar/p1?paso=3')
  })

  it('un doble click hace un solo pedido', async () => {
    const f = vi.fn(async () => json({ analisis: analisis(), desdeCache: false, promocion: promo }))
    vi.stubGlobal('fetch', f)
    render(<PasoAntecedentes {...props} />)
    const b = screen.getByRole('button', { name: /Revisar cómo nos fue/ })
    fireEvent.click(b)
    fireEvent.click(b)
    await screen.findByText(/Qué funcionó/)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('sin resultados de la marca explica el motivo en castellano y deja seguir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Todavía no hay resultados de Benelli Store Quilmes para comparar. Podés seguir sin este paso.' }, 422)))
    render(<PasoAntecedentes {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar cómo nos fue/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Podés seguir sin este paso')
    expect(screen.getByRole('link', { name: /Seguir sin revisar/ })).toBeInTheDocument()
  })

  it('apagado (sin clave de OpenAI): botón deshabilitado y lo explica', () => {
    render(<PasoAntecedentes {...props} habilitado={false} />)
    expect(screen.getByRole('button', { name: /Revisar cómo nos fue/ })).toBeDisabled()
    expect(screen.getByText(/está apagada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Seguir sin revisar/ })).toBeInTheDocument()
  })

  it('un lector no puede pedirlo', () => {
    render(<PasoAntecedentes {...props} puedeEditar={false} />)
    expect(screen.getByRole('button', { name: /Revisar cómo nos fue/ })).toBeDisabled()
  })
})

describe('<PasoAntecedentes> · con el análisis', () => {
  it('lo muestra con su costo y avisa si estaba guardado', () => {
    render(<PasoAntecedentes {...props} promocion={{ ...promo, analisisId: 'a1' }} analisis={analisis({ desdeCache: true })} />)
    expect(screen.getByText(/Recomendaciones: publicá a la tarde\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Revisar cómo nos fue/ })).toBeNull()
  })

  it('se puede editar: guarda con la versión que veía y vuelve a mostrar el texto nuevo', async () => {
    const f = vi.fn(async () => json({ analisis: analisis({ contenido: 'Texto corregido', version: 2 }) }))
    vi.stubGlobal('fetch', f)
    render(<PasoAntecedentes {...props} promocion={{ ...promo, analisisId: 'a1' }} analisis={analisis()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Análisis'), { target: { value: 'Texto corregido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByLabelText('Análisis')).toBeNull())
    expect(screen.getByText('Texto corregido')).toBeInTheDocument()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/analisis/a1')
    expect(JSON.parse(String(init.body))).toEqual({ version: 1, contenido: 'Texto corregido' })
    expect(router.refresh).toHaveBeenCalled()
  })

  it('un 409 al editar pide recargar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Este análisis cambió: recargá la pantalla.' }, 409)))
    render(<PasoAntecedentes {...props} promocion={{ ...promo, analisisId: 'a1' }} analisis={analisis()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('recargá la pantalla')
  })

  it('un lector no ve "Editar"', () => {
    render(<PasoAntecedentes {...props} puedeEditar={false} promocion={{ ...promo, analisisId: 'a1' }} analisis={analisis()} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('cancelar la edición vuelve al texto original sin llamar al servidor', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoAntecedentes {...props} promocion={{ ...promo, analisisId: 'a1' }} analisis={analisis()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Análisis')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('una promoción aprobada no se toca: sin editar ni pedir de nuevo', () => {
    render(<PasoAntecedentes {...props} promocion={{ ...promo, estado: 'aprobada', analisisId: 'a1' }} analisis={analisis()} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })
})

describe('espera', () => {
  it('mientras analiza lo dice con role=status', async () => {
    let soltar!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => (soltar = res))))
    render(<PasoAntecedentes {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar cómo nos fue/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Revisando/)
    soltar(json({ analisis: analisis(), desdeCache: false, promocion: promo }))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
