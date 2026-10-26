import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoPlaca } from './paso-placa'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion, ID_ESCENA } from '@/lib/promocion/fixture'
import type { DetallePromocion } from '@/lib/promocion/pantalla'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const fuentes = { titulo: 'Anton', texto: 'Inter' }
const base = vistaDePromocion(filaPromocion({ id: 'p1', revision: 5, copy: copyDePrueba(), copy_opcion: 1, titular: null }))
const escena = (o: Partial<DetallePromocion['escenas'][number]['creativos'][number]> = {}) => ({
  id: ID_ESCENA, generacionId: 'g1', orden: 1, url: 'https://x/e1.jpg', ancho: 1024, alto: 1280, costoUsd: 0.04, error: null, elegida: false, esLaElegida: false, ...o,
})
const gen = (creativos = [escena()]) => ({
  generacion: { id: 'g1', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 2, costoEstimadoUsd: 0.09, costoRealUsd: 0.08, error: null, creadoEn: '2026-10-25T12:00:00+00:00', interrumpida: false, edicion: 'promocion' },
  creativos,
})
const props = {
  promocion: base, marca: 'Benelli Store Quilmes', fotoUrl: 'https://x/foto.jpg', escenas: [] as DetallePromocion['escenas'], placaUrl: null as string | null,
  puedeEditar: true, apagado: null as string | null, topeUsd: 10 as number | null, gastadoUsd: 1, motor: 'gemini-nano-banana-2.1', fuentes,
}
const conDiseno = { ...base, plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }
const estimacion = (o: Record<string, unknown> = {}) => ({ generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.0672, costoEstimadoUsd: 0.09, venceEn: '2026-10-25T13:00:00Z', origen: 'promocion' }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false, ...o })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoPlaca> · diseño y fondo', () => {
  it('ofrece los tres diseños con nombre y una miniatura sobre la foto original', () => {
    render(<PasoPlaca {...props} />)
    const g = screen.getByRole('radiogroup', { name: 'Diseño' })
    expect(g.querySelectorAll('input[type=radio]')).toHaveLength(3)
    for (const n of ['Precio abajo', 'Precio arriba', 'Catálogo']) expect(screen.getByRole('radio', { name: new RegExp(n) })).toBeInTheDocument()
  })

  it('elegir un diseño lo guarda con el fondo sugerido y la revisión que veía', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, plantilla: 'catalogo', fondo: 'fondo_estudio' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: /Catálogo/ }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /Catálogo/ })).toBeChecked())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 5, plantilla: 'catalogo', fondo: 'fondo_estudio' })
  })

  it('si ya había un fondo elegido, un diseño nuevo lo respeta', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, plantilla: 'oferta_arriba', fondo: 'escenario_ruta' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...base, fondo: 'escenario_ruta' }} />)
    fireEvent.click(screen.getByRole('radio', { name: /Precio arriba/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ plantilla: 'oferta_arriba', fondo: 'escenario_ruta' })
  })

  it('el fondo se elige aparte, con nombre y descripción', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, fondo: 'escenario_urbano' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('radio', { name: /Escenario urbano/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 5, fondo: 'escenario_urbano' })
  })
})

describe('<PasoPlaca> · generar la imagen (compuerta de costo)', () => {
  it('"Ver precio" no se habilita hasta elegir diseño y fondo', () => {
    render(<PasoPlaca {...props} />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
  })

  it('estima SIN precio del cliente, muestra el monto y recién "Confirmar" gasta', async () => {
    const f = vi.fn(async (u: string) => {
      if (u === '/api/generaciones') return json(estimacion(), 201)
      return json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.08, costoEstimadoUsd: 0.09, error: null }, creativos: [] })
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    const confirmar = await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(f).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ promocionId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    expect(screen.getByText(/Recién acá se cobra/)).toBeInTheDocument()
    fireEvent.click(confirmar)
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe('/api/generaciones/g9/confirmar')
    expect(await screen.findByText(/Costo real/)).toBeInTheDocument()
  })

  it('sin tocar "Confirmar" nunca se llama al confirmador', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(f.mock.calls.some((c) => String((c as unknown as [string])[0]).includes('confirmar'))).toBe(false)
  })

  it('si supera el tope del mes no se puede confirmar y lo explica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion({ excedeTope: true }), 201)))
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: /Confirmar US\$/ })).toBeDisabled()
    expect(screen.getByText(/supera lo que queda del tope mensual/)).toBeInTheDocument()
  })

  it('el 402 del servidor se dice en castellano con lo que queda', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'Supera el tope mensual.', topeUsd: 10, restanteUsd: 0.05 }, 402))))
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Supera el tope del mes: quedan/)
  })

  it('el 410 y el 409 se explican sin jerga', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json({ error: 'x' }, 410))))
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/La estimación venció/)
  })

  it('apagado (sin clave o sin tope): deshabilitado con el motivo', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} apagado="Generar imágenes está apagado: falta la clave de Gemini. Avisale a quien administra el sistema." />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
    expect(screen.getByText(/falta la clave de Gemini/)).toBeInTheDocument()
  })

  it('un lector no ve las acciones y las opciones quedan deshabilitadas', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} puedeEditar={false} />)
    for (const nombre of ['Ver precio', 'Guardar titular', 'Ver la versión final']) expect(screen.queryByRole('button', { name: nombre })).toBeNull()
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
  })
})

describe('<PasoPlaca> · elegir la imagen, el titular y la versión final', () => {
  const elegida = { ...conDiseno, escenaCreativoId: ID_ESCENA }

  it('sin imágenes generadas lo dice', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    expect(screen.getByText(/Todavía no generaste ninguna imagen/)).toBeInTheDocument()
  })

  it('cada imagen se elige por radio; elegirla manda solo su id', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, escenaCreativoId: ID_ESCENA }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} escenas={[gen([escena(), escena({ id: 'c2', orden: 2, url: 'https://x/e2.jpg' })])]} />)
    fireEvent.click(screen.getAllByRole('radio', { name: /Usar esta imagen/ })[0]!)
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 5, escenaCreativoId: ID_ESCENA })
  })

  it('una imagen que falló se muestra con su error y no se puede elegir', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} escenas={[gen([escena({ id: 'c3', url: null, error: 'Gemini no devolvió imagen' })])]} />)
    expect(screen.getByText('Gemini no devolvió imagen')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Usar esta imagen/ })).toBeNull()
  })

  it('con una imagen elegida arma la vista previa con el precio EXACTO', () => {
    render(<PasoPlaca {...props} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    expect(screen.getByRole('img', { name: /Vista previa.*\$ 4\.500\.000/ })).toBeInTheDocument()
  })

  it('el titular se corrige y se guarda; si trae un número el servidor lo rechaza y se ve', async () => {
    const f = vi.fn(async () => json({ error: 'Revisá lo que cambiaste.', errores: ['El titular no lleva precios ni números: el precio va aparte, en la imagen.'] }, 400))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    expect(screen.getByLabelText('Titular')).toHaveValue('Tu próxima aventura')
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Desde 12 cuotas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar titular' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no lleva precios ni números')
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 5, titular: 'Desde 12 cuotas' })
  })

  it('"Ver la versión final" arma el PNG real, lo muestra y habilita aprobar', async () => {
    const f = vi.fn(async () => json({ url: 'https://x/final.png', hash: 'h', reutilizada: false, promocion: { ...elegida, revision: 6, placaLista: true, pasoActual: 5 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    expect(screen.queryByRole('link', { name: /Seguir a aprobar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver la versión final' }))
    expect(await screen.findByAltText(/Imagen final/)).toHaveAttribute('src', 'https://x/final.png')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/promociones/p1/placa')
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 5 })
    expect(screen.getByRole('link', { name: /Seguir a aprobar/ })).toHaveAttribute('href', '/promocionar/p1?paso=5')
  })

  it('un texto que no entra en el diseño se dice con el mensaje del servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'El texto del modelo es muy largo para este diseño.' }, 422)))
    render(<PasoPlaca {...props} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver la versión final' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('muy largo para este diseño')
  })

  it('sin imagen elegida no hay versión final', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    expect(screen.getByRole('button', { name: 'Ver la versión final' })).toBeDisabled()
  })

  it('con la placa ya lista muestra la imagen final de entrada', () => {
    render(<PasoPlaca {...props} promocion={{ ...elegida, placaLista: true, pasoActual: 5 }} placaUrl="https://x/final.png" escenas={[gen([escena({ esLaElegida: true })])]} />)
    expect(screen.getByAltText(/Imagen final/)).toHaveAttribute('src', 'https://x/final.png')
    expect(screen.getByRole('link', { name: /Seguir a aprobar/ })).toBeInTheDocument()
  })

  it('una promoción aprobada no se toca desde acá', () => {
    render(<PasoPlaca {...props} promocion={{ ...elegida, estado: 'aprobada' }} />)
    expect(screen.queryByRole('button', { name: 'Ver precio' })).toBeNull()
    expect(screen.getByText(/Está aprobada/)).toBeInTheDocument()
  })
})
