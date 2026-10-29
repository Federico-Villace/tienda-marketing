import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoPlaca } from './paso-placa'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'
import type { DetallePromocion } from '@/lib/promocion/pantalla'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const base = vistaDePromocion(filaPromocion({ id: 'p1', revision: 5, copy: copyDePrueba(), copy_opcion: 1, plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }))
const escenas = (deTanda: boolean): DetallePromocion['escenas'] => [
  {
    generacion: { id: 'g1', estado: 'ok', motor: 'm', cantidad: 1, costoEstimadoUsd: 0.05, costoRealUsd: 0.04, error: null, creadoEn: '2026-10-29T10:00:00Z', interrumpida: false, ...(deTanda ? { deTanda: true } : {}) },
    creativos: [{ id: 'c1', generacionId: 'g1', orden: 1, url: 'https://x/c1.jpg', ancho: 1, alto: 1, costoUsd: 0.04, error: null, elegida: false, esLaElegida: false }],
  },
]
const props = {
  promocion: base, marca: 'Benelli', fotoUrl: null, placaUrl: null, puedeEditar: true, apagado: null, topeUsd: 10, gastadoUsd: 1,
  motor: 'gemini-nano-banana-2.1', fuentes: { titulo: 'Anton', texto: 'Inter' }, inspiracion: null,
}
const estimacion = () => ({
  generacion: { id: 'g9', motor: 'm', cantidad: 1, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.045, costoEstimadoUsd: 0.047, venceEn: '2026-10-25T13:00:00Z' },
  mes: { gastadoUsd: 1, topeUsd: 10 },
  excedeTope: false,
})

/** fetch falso de todo el camino: estimar, confirmar (la imagen nueva es cN) y los PATCH. */
function mundo() {
  const patches: { url: string; cuerpo: Record<string, unknown> }[] = []
  const f = vi.fn(async (u: string, init?: RequestInit) => {
    if (u === '/api/generaciones') return json(estimacion(), 201)
    if (u.endsWith('/confirmar')) return json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.047, error: null }, creativos: [{ id: 'cN', url: 'https://x/n.jpg' }] })
    if (init?.method === 'PATCH') {
      const cuerpo = JSON.parse(String(init.body))
      patches.push({ url: u, cuerpo })
      return json({ promocion: { ...base, revision: (cuerpo.revision as number) + 1, escenaCreativoId: cuerpo.escenaCreativoId }, avisos: [] })
    }
    throw new Error(`URL inesperada: ${u}`)
  })
  return { f, patches }
}

async function pedirCambioYConfirmar() {
  fireEvent.click(screen.getByRole('button', { name: 'Pedile un cambio' }))
  fireEvent.change(screen.getByLabelText(/Qué querés cambiar/), { target: { value: 'más oscuro' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ver precio del cambio' }))
  fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  router.refresh.mockClear()
})

describe('<PasoPlaca> · pedile un cambio a una imagen', () => {
  it('pide con la promoción, y al terminar la imagen nueva pasa a ser la de ESTA promoción', async () => {
    const m = mundo()
    vi.stubGlobal('fetch', m.f)
    render(<PasoPlaca {...props} escenas={escenas(false)} />)
    await pedirCambioYConfirmar()
    const pedido = JSON.parse(String((m.f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(pedido).toEqual({ creativoId: 'c1', instruccion: 'más oscuro', promocionId: 'p1' })
    await waitFor(() => expect(m.patches).toHaveLength(1))
    expect(m.patches[0]!.cuerpo).toEqual({ revision: 5, escenaCreativoId: 'cN' })
    expect(screen.queryByRole('button', { name: /Usar también/ })).toBeNull()
  })

  it('en una hija de tanda: "Usar también en las otras N" hace un PATCH por placa SOLO después del click', async () => {
    const m = mundo()
    vi.stubGlobal('fetch', m.f)
    render(<PasoPlaca {...props} escenas={escenas(true)} hermanas={[{ id: 'h2', revision: 3 }, { id: 'h3', revision: 7 }]} />)
    await pedirCambioYConfirmar()
    const usar = await screen.findByRole('button', { name: 'Usar también en las otras 2 placas' })
    await waitFor(() => expect(m.patches).toHaveLength(1)) // solo la de esta promoción
    fireEvent.click(usar)
    await waitFor(() => expect(m.patches).toHaveLength(3))
    expect(m.patches.slice(1).map((p) => [p.url, p.cuerpo])).toEqual([
      ['/api/promociones/h2', { revision: 3, escenaCreativoId: 'cN' }],
      ['/api/promociones/h3', { revision: 7, escenaCreativoId: 'cN' }],
    ])
    expect(await screen.findByText(/Imagen puesta en 2 placas más/)).toBeInTheDocument()
  })

  it('el lector no ve "Pedile un cambio"', () => {
    render(<PasoPlaca {...props} puedeEditar={false} escenas={escenas(false)} />)
    expect(screen.queryByRole('button', { name: 'Pedile un cambio' })).toBeNull()
  })
})
