import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { CompuertaImagen } from './compuerta-imagen'
import { postEstimacionPromocion } from '@/components/creativos/api'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const estimacion = (o: Record<string, unknown> = {}) => ({
  generacion: { id: 'g9', motor: 'm', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.0672, costoEstimadoUsd: 0.09, venceEn: '2026-10-25T13:00:00Z' },
  mes: { gastadoUsd: 1, topeUsd: 10 },
  excedeTope: false,
  ...o,
})
const props = { apagado: null, puedeEditar: true, topeUsd: 10, gastadoUsd: 1, pedir: () => postEstimacionPromocion({ promocionId: 'p1', motor: 'm', cantidad: 2 }) }

afterEach(() => {
  vi.unstubAllGlobals()
  router.refresh.mockClear()
})

describe('CompuertaImagen (la única compuerta de costo de las imágenes)', () => {
  it('sin click en "Ver precio" no se llama a nada, y sin click en Confirmar nunca se confirma', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<CompuertaImagen {...props} />)
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(f).toHaveBeenCalledTimes(1)
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe('/api/generaciones')
  })

  it('doble click en Confirmar: una sola request de cobro', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn((u: string) => (u === '/api/generaciones' ? Promise.resolve(json(estimacion(), 201)) : new Promise<Response>((r) => (terminar = r))))
    vi.stubGlobal('fetch', f)
    render(<CompuertaImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    const confirmar = await screen.findByRole('button', { name: /Confirmar US\$/ })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => expect(screen.getByRole('button', { name: /Generando/ })).toBeDisabled())
    expect(f.mock.calls.filter((c) => String((c as unknown as [string])[0]).includes('confirmar'))).toHaveLength(1)
    terminar(json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.08, costoEstimadoUsd: 0.09, error: null }, creativos: [] }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it('si supera el tope del mes no se puede confirmar; el 402 deja el botón deshabilitado y avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'x', topeUsd: 10, restanteUsd: 0.05 }, 402))))
    render(<CompuertaImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Supera el tope del mes/)
    expect(screen.getByRole('button', { name: /Confirmar US\$/ })).toBeDisabled()
  })

  it('un error al estimar se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró.' }, 410)))
    render(<CompuertaImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La foto se borró.')
  })

  it('si "antes" falla (no se pudo guardar lo escrito) no se estima', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<CompuertaImagen {...props} antes={async () => false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver precio' })).toBeEnabled())
    expect(f).not.toHaveBeenCalled()
  })

  it('el lector no ve el botón; apagado o deshabilitado no deja estimar', () => {
    const { rerender } = render(<CompuertaImagen {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<CompuertaImagen {...props} apagado="Generar imágenes está apagado." />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
    rerender(<CompuertaImagen {...props} deshabilitado />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
  })
})
