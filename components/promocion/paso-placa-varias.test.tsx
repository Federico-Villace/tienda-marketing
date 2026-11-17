import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoPlacaVarias } from './paso-placa-varias'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion, ID_ESCENA } from '@/lib/promocion/fixture'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import type { MotoExtra } from '@/lib/promocion/varias/tipos'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const fuentes = { titulo: 'Anton', texto: 'Inter' }
const extra = (n: number): MotoExtra => ({ fotoId: `f${n}`, modelo: `LEONCINO ${n}00`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' } })
const fila = (o: Record<string, unknown> = {}) => filaPromocion({ id: 'p1', revision: 5, copy: copyDePrueba(), copy_opcion: 1, titular: null, motos_extra: [extra(2), extra(3)], ...o } as never)
const base = vistaDePromocion(fila())
const motos: NonNullable<DetallePromocion['motos']> = [
  { fotoId: 'f1', modelo: 'TRK 502', precio: '$ 4.500.000', condicion: '12 cuotas sin interés', url: 'https://x/f1.jpg', borrada: false },
  { fotoId: 'f2', modelo: 'LEONCINO 200', precio: '$ 2.000.000', condicion: '', url: 'https://x/f2.jpg', borrada: false },
  { fotoId: 'f3', modelo: 'LEONCINO 300', precio: '$ 3.000.000', condicion: '', url: 'https://x/f3.jpg', borrada: false },
]
const props = {
  promocion: base, marca: 'Suzuki Quilmes', motos, escenas: [] as DetallePromocion['escenas'], placaUrl: null as string | null, puedeEditar: true, apagado: null as string | null,
  topeUsd: 10 as number | null, gastadoUsd: 1, motor: 'gemini-nano-banana-2.1', fuentes, inspiracion: null as { id: string; url: string | null; borrada: boolean } | null, verificacionUsd: 0.05, esperaGuardadoMs: 20,
}
const grilla = { ...base, plantilla: 'varias_motos' }
const copia = { ...base, plantilla: 'copia_fiel', inspiracionFotoId: 'i1', inspiracionModo: 'diseno' as const }
const insp = { id: 'i1', url: 'https://x/i1.jpg', borrada: false }
const cuerpoDe = (f: { mock: { calls: unknown[][] } }, i = 0) => JSON.parse(String((f.mock.calls[i] as unknown as [string, RequestInit])[1].body))
const estimacion = (o: Record<string, unknown> = {}) => ({ generacion: { id: 'g9', motor: 'gemini-3-pro-image', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.134, listaUsd: 0.268, costoEstimadoUsd: 0.48, venceEn: '2026-11-18T13:00:00Z', origen: 'promocion', copiaFiel: true, verificacionUsd: 0.05 }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false, ...o })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoPlacaVarias> · cómo armar la placa', () => {
  it('ofrece la copia fiel y la grilla de motos (sin costo)', () => {
    render(<PasoPlacaVarias {...props} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Cómo armar la placa' })
    expect(within(grupo).getByRole('radio', { name: /Copia fiel de tu referencia/ })).toBeInTheDocument()
    expect(within(grupo).getByRole('radio', { name: /Grilla de motos \(sin costo\)/ })).toBeInTheDocument()
  })
  it('elegir la grilla es UN guardado gratis y nunca toca la compuerta de costo', async () => {
    const f = vi.fn(async () => json({ promocion: { ...grilla, revision: 6 }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} />)
    const radio = screen.getByRole('radio', { name: /Grilla de motos/ })
    fireEvent.click(radio)
    await waitFor(() => expect(radio).toBeChecked())
    expect(f).toHaveBeenCalledTimes(1)
    expect(cuerpoDe(f)).toEqual({ revision: 5, plantilla: 'varias_motos' })
    expect((f.mock.calls as unknown[][]).every((c) => !String(c[0]).startsWith('/api/generaciones'))).toBe(true)
  })
  it('un lector ve todo deshabilitado y ningún botón que arme o gaste', () => {
    render(<PasoPlacaVarias {...props} promocion={copia} inspiracion={insp} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: 'Ver precio' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver la versión final' })).toBeNull()
    expect(screen.queryByTestId('textos-copia')).toBeNull()
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
  })
  it('una promoción aprobada no se toca desde acá', () => {
    render(<PasoPlacaVarias {...props} promocion={{ ...grilla, estado: 'aprobada' }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/aprobada/)
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

describe('<PasoPlacaVarias> · grilla de motos', () => {
  it('muestra la vista previa con TODAS las motos y no ofrece generar imágenes', () => {
    render(<PasoPlacaVarias {...props} promocion={grilla} />)
    const previa = screen.getByTestId('previa-grilla')
    for (const x of ['TRK 502', '$ 4.500.000', 'LEONCINO 200', '$ 2.000.000', 'LEONCINO 300', '$ 3.000.000']) expect(within(previa).getAllByText(x).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Ver precio' })).toBeNull()
    expect(screen.queryByText('Generar la imagen')).toBeNull()
  })
  it('"Ver la versión final" arma la placa con la revisión que se veía y deja seguir a aprobar', async () => {
    const f = vi.fn(async () => json({ url: 'https://x/final.png', hash: 'h', reutilizada: false, promocion: { ...grilla, revision: 6, placaLista: true, pasoActual: 5 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={grilla} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver la versión final' }))
    expect(await screen.findByText('Imagen final lista.')).toBeInTheDocument()
    expect(f).toHaveBeenCalledTimes(1)
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/promociones/p1/placa')
    expect(cuerpoDe(f)).toEqual({ revision: 5 })
    expect(screen.getByRole('link', { name: 'Seguir a aprobar' })).toHaveAttribute('href', '/promocionar/p1?paso=5')
  })
  it('el titular se guarda solo al dejar de escribir, con su revisión', async () => {
    const f = vi.fn(async () => json({ promocion: { ...grilla, revision: 6, titular: 'Todas en stock' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={grilla} />)
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Todas en stock' } })
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(cuerpoDe(f)).toEqual({ revision: 5, titular: 'Todas en stock' })
  })
  it('una línea extra con emoji no se guarda y bloquea la versión final', async () => {
    const f = vi.fn(async () => json({ promocion: grilla, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={grilla} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hot Sale 🔥' } })
    await new Promise((r) => setTimeout(r, 80))
    expect(f).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ver la versión final' })).toBeDisabled()
  })
  it('destildar el precio lo saca de todas las motos: un guardado con ocultos', async () => {
    const f = vi.fn(async () => json({ promocion: { ...grilla, revision: 6, diseno: { ocultos: ['precio'] } }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={grilla} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Precio' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(cuerpoDe(f)).toEqual({ revision: 5, diseno: { ocultos: ['precio'] } })
  })
})

describe('<PasoPlacaVarias> · copia fiel de varias motos', () => {
  const ver = (o: Record<string, unknown> = {}) => ({ id: 'v1', estado: 'ok' as const, diferencias: [], avisos: [], puedeReverificar: false, costoReverificarUsd: null, ...o })
  const genCopia = (creativos: unknown[], o: Record<string, unknown> = {}) => ({
    generacion: { id: 'g1', estado: 'ok', motor: 'gemini-3-pro-image', cantidad: 2, costoEstimadoUsd: 0.48, costoRealUsd: 0.4, error: null, creadoEn: '2026-11-18T12:00:00+00:00', interrumpida: false, edicion: 'promocion', copiaFiel: true, aspecto: '4:5', textosVigentes: true, ...o },
    creativos,
  }) as unknown as DetallePromocion['escenas'][number]
  const cre = (id: string, verificacion?: unknown) => ({ id, generacionId: 'g1', orden: 1, url: `https://x/${id}.jpg`, ancho: 1024, alto: 1280, costoUsd: 0.04, error: null, elegida: false, esLaElegida: false, ...(verificacion ? { verificacion } : {}) })

  it('lista cada moto con su modelo y su precio, de solo lectura, y la línea que se le pide a la IA', () => {
    render(<PasoPlacaVarias {...props} promocion={copia} inspiracion={insp} />)
    const lista = screen.getByRole('list', { name: 'Motos de la placa' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('linea-pedida')).toHaveTextContent('LEONCINO 200')
    expect(screen.getByTestId('linea-pedida')).toHaveTextContent('$ 3.000.000')
  })
  it('"Ver precio" estima SIN precio del cliente y NO gasta hasta "Confirmar"', async () => {
    const f = vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json({})))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={copia} inspiracion={insp} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByText(/revisión de textos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar ~US\$ 0,48/ })).toBeInTheDocument()
    expect(cuerpoDe(f, 0)).toEqual({ promocionId: 'p1', motor: 'gemini-3-pro-image', cantidad: 2 })
    expect((f.mock.calls as unknown[][]).some((c) => String(c[0]).includes('/confirmar'))).toBe(false)
  })
  it('un doble click en "Ver precio" pide UNA estimación', async () => {
    const f = vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json({})))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={copia} inspiracion={insp} />)
    const b = screen.getByRole('button', { name: 'Ver precio' })
    fireEvent.click(b)
    fireEvent.click(b)
    await screen.findByText(/revisión de textos/)
    expect((f.mock.calls as unknown[][]).filter((c) => c[0] === '/api/generaciones')).toHaveLength(1)
  })
  it('sin referencia no se puede estimar', () => {
    render(<PasoPlacaVarias {...props} promocion={{ ...copia, inspiracionFotoId: null }} />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
    expect(screen.getByText('Primero elegí la foto de tu referencia.')).toBeInTheDocument()
  })
  it('una variante cuyos textos difieren NO se puede usar y "Ver la versión final" sigue bloqueado', () => {
    const dif = ver({ estado: 'difiere', diferencias: [{ campo: 'precio', motivo: 'distinto', esperado: '$ 2.000.000', leido: '$ 2.000.00', moto: 2 }] })
    render(<PasoPlacaVarias {...props} promocion={{ ...copia, escenaCreativoId: ID_ESCENA }} inspiracion={insp} escenas={[genCopia([cre(ID_ESCENA, dif)])]} />)
    expect(screen.getByText(/Moto 2 · Precio: dice «\$ 2\.000\.00», tenía que decir «\$ 2\.000\.000»/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver la versión final' })).toBeDisabled()
  })
  it('con una variante revisada y elegida, "Ver la versión final" arma la placa', async () => {
    const f = vi.fn(async () => json({ url: 'https://x/final.png', hash: 'h', reutilizada: false, promocion: { ...copia, revision: 6, escenaCreativoId: ID_ESCENA, placaLista: true } }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlacaVarias {...props} promocion={{ ...copia, escenaCreativoId: ID_ESCENA }} inspiracion={insp} escenas={[genCopia([cre(ID_ESCENA, ver())])]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver la versión final' }))
    expect(await screen.findByText('Imagen final lista.')).toBeInTheDocument()
    expect(cuerpoDe(f)).toEqual({ revision: 5 })
  })
  it('no ofrece pedir cambios a la IA sobre la imagen (con varias motos no se puede)', () => {
    render(<PasoPlacaVarias {...props} promocion={{ ...copia, escenaCreativoId: ID_ESCENA }} inspiracion={insp} escenas={[genCopia([cre(ID_ESCENA, ver())])]} />)
    expect(screen.queryByRole('button', { name: /Pedile un cambio|Pedir un cambio/i })).toBeNull()
    expect(screen.getByText(/no se piden cambios a la IA/)).toBeInTheDocument()
  })
  it('si cambiaste los textos después de generar, lo avisa y bloquea la versión final', () => {
    render(<PasoPlacaVarias {...props} promocion={{ ...copia, escenaCreativoId: ID_ESCENA }} inspiracion={insp} escenas={[genCopia([cre(ID_ESCENA, ver())], { textosVigentes: false })]} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Cambiaste los textos: la imagen tiene los anteriores/)
    expect(screen.getByRole('button', { name: 'Ver la versión final' })).toBeDisabled()
  })
})
