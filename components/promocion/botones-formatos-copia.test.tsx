import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { BotonesFormatosCopia } from './botones-formatos-copia'
import type { DepsDescarga } from '@/lib/descargas/descargar'
import type { DetallePromocion } from '@/lib/promocion/pantalla'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const deps = (): DepsDescarga => ({ puedeCompartirArchivos: () => false, traerArchivo: vi.fn(), compartir: vi.fn(), clickEnlace: vi.fn(), abrir: vi.fn(), esperar: async () => {} })
afterEach(() => vi.unstubAllGlobals())

const ver = (o: Record<string, unknown> = {}) => ({ id: 'v1', estado: 'ok' as const, diferencias: [], avisos: [], puedeReverificar: false, costoReverificarUsd: null, ...o })
const extra = (aspecto: string, verificacion: unknown, o: Record<string, unknown> = {}) =>
  ({
    generacion: { id: `g-${aspecto}`, estado: 'ok', motor: 'gemini-3-pro-image', cantidad: 1, costoEstimadoUsd: 0.24, costoRealUsd: 0.2, error: null, creadoEn: '2026-11-18T12:00:00+00:00', interrumpida: false, copiaFiel: true, aspecto, textosVigentes: true, ...o },
    creativos: [{ id: `c-${aspecto}`, generacionId: `g-${aspecto}`, orden: 1, url: 'https://x/c.jpg', ancho: 1, alto: 1, costoUsd: 0.19, error: null, elegida: false, ...(verificacion ? { verificacion } : {}) }],
  }) as unknown as DetallePromocion['formatosExtra'][number]
const props = { promocionId: 'p1', modelo: 'TRK 502', aspecto: '4:5' as const, formatosExtra: [] as DetallePromocion['formatosExtra'], puedeEditar: true, apagado: null as string | null, topeUsd: 10, gastadoUsd: 1, motor: 'gemini-3-pro-image', deps: deps() }
const estimacion = { generacion: { id: 'g9', motor: 'gemini-3-pro-image', cantidad: 1, aspecto: '1:1', porImagenUsd: 0.134, listaUsd: 0.134, costoEstimadoUsd: 0.23724, venceEn: '2026-11-18T13:00:00Z', origen: 'promocion', copiaFiel: true, verificacionUsd: 0.05 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false }

describe('<BotonesFormatosCopia>', () => {
  it('el formato de la promoción se baja gratis: UN pedido a /formatos', async () => {
    let soltar: (r: Response) => void = () => {}
    const f = vi.fn(() => new Promise<Response>((res) => (soltar = res)))
    vi.stubGlobal('fetch', f)
    const d = deps()
    render(<BotonesFormatosCopia {...props} deps={d} />)
    const b = screen.getByRole('button', { name: 'Descargar Feed 4:5 (gratis)' })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(f).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ formato: '4:5' })
    soltar(json({ url: 'https://x/f.png', formato: '4:5', hash: 'h', reutilizada: false }))
    await waitFor(() => expect(d.clickEnlace).toHaveBeenCalledWith('https://x/f.png', 'trk-502-4x5.png'))
  })

  it('dice que cada otro formato es una imagen nueva que se paga aparte', () => {
    render(<BotonesFormatosCopia {...props} />)
    expect(screen.getByText(/Cada formato distinto del tuyo es una imagen nueva que hace la IA: se paga aparte/)).toBeInTheDocument()
  })

  it('otro formato sin imagen: "Ver precio" (gratis) muestra imagen + revisión y NO gasta hasta Confirmar', async () => {
    const f = vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion) : json({})))
    vi.stubGlobal('fetch', f)
    render(<BotonesFormatosCopia {...props} />)
    const caja = within(screen.getByText('Cuadrado 1:1').closest('div')!)
    fireEvent.click(caja.getByRole('button', { name: 'Cuadrado 1:1 · Ver precio' }))
    expect(await screen.findByRole('button', { name: 'Confirmar ~US$ 0,24' })).toBeInTheDocument()
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ promocionId: 'p1', motor: 'gemini-3-pro-image', cantidad: 1, formato: '1:1' })
    expect((f.mock.calls as unknown[][]).some((c) => String(c[0]).includes('/confirmar'))).toBe(false)
  })

  it('una imagen ya generada y revisada de ese formato se baja gratis, indicando cuál', async () => {
    const f = vi.fn(async () => json({ url: 'https://x/c.png', formato: '1:1', hash: 'h', reutilizada: false }))
    vi.stubGlobal('fetch', f)
    const d = deps()
    render(<BotonesFormatosCopia {...props} deps={d} formatosExtra={[extra('1:1', ver())]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Cuadrado 1:1 (ya generada)' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ formato: '1:1', creativoId: 'c-1:1' })
  })

  it('si los textos no coinciden NO se baja: se ven las diferencias y se ofrece generar otra (por la compuerta)', () => {
    const v = ver({ estado: 'difiere', diferencias: [{ campo: 'precio', motivo: 'distinto', esperado: '$ 4.500.000', leido: '$ 4.500.00' }] })
    render(<BotonesFormatosCopia {...props} formatosExtra={[extra('1:1', v)]} />)
    expect(screen.queryByRole('button', { name: /Descargar Cuadrado/ })).toBeNull()
    expect(screen.getByText('Precio: dice «$ 4.500.00», tenía que decir «$ 4.500.000»')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar otra Cuadrado 1:1 · Ver precio' })).toBeInTheDocument()
  })

  it('una imagen de textos viejos (cambiaste los textos) no se baja y lo avisa', () => {
    render(<BotonesFormatosCopia {...props} formatosExtra={[extra('9:16', ver(), { textosVigentes: false })]} />)
    expect(screen.queryByRole('button', { name: /Descargar Historia/ })).toBeNull()
    expect(screen.getByText(/Cambiaste los textos: la imagen que había tiene los anteriores/)).toBeInTheDocument()
  })

  it('el lector no ve ningún botón que gaste (ni "Ver precio" ni "Revisar de nuevo")', () => {
    const v = ver({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })
    render(<BotonesFormatosCopia {...props} puedeEditar={false} formatosExtra={[extra('1:1', v)]} />)
    expect(screen.queryByRole('button', { name: /Ver precio/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Revisar de nuevo/ })).toBeNull()
  })

  it('un error del servidor al bajar se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Los textos de esta imagen no están verificados: elegí otra o generá de nuevo.' }, 422)))
    render(<BotonesFormatosCopia {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Feed 4:5 (gratis)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no están verificados/)
  })
})
