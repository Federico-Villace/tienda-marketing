import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { ImagenesLote } from './imagenes-lote'
import type { GrupoDeTandaVista, TandaVista } from '@/lib/promocion/tanda/pantalla'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const gen = (id: string, estado: string, o: Record<string, unknown> = {}) => ({
  id,
  estado,
  motor: 'gemini-nano-banana-2.1',
  cantidad: 1,
  costoEstimadoUsd: 0.045,
  costoRealUsd: null,
  error: null,
  creadoEn: '2026-10-28T12:00:00+00:00',
  interrumpida: false,
  ...o,
})
const creativo = (id: string, generacionId: string, usadaEn = 0, url: string | null = `https://x/${id}.jpg`) => ({
  id,
  generacionId,
  orden: 1,
  url,
  ancho: 1024,
  alto: 1280,
  costoUsd: 0.04,
  error: url ? null : 'falló',
  elegida: false,
  usadaEn,
})
const grupo = (n: number, modelo: string, escenas: GrupoDeTandaVista['escenas'] = [], hijas = 2): GrupoDeTandaVista => ({
  grupo: n,
  modelo,
  hijaIds: Array.from({ length: hijas }, (_, i) => `h${n}-${i}`),
  foto: null,
  comparten: { ok: true },
  escenas,
})
const tandaDe = (o: Partial<TandaVista> = {}): TandaVista =>
  ({
    tanda: { id: 'T1', creadoEn: '2026-10-28T12:00:00+00:00' },
    tipo: 'motos',
    hijas: [],
    grupos: [grupo(1, 'TRK 502'), grupo(2, 'Leoncino'), grupo(3, 'Imperiale')],
    pendientes: [],
    resumen: { total: 6, aprobadas: 0, listas: 0 },
    comparten: { ok: true },
    foto: null,
    inspiracion: null,
    escenas: [],
    gastadoUsd: 1.5,
    ...o,
  }) as TandaVista

const loteEstimado = (n = 3) => ({
  id: 'L1',
  costoEstimadoUsd: Math.round(n * 0.045028 * 1e6) / 1e6,
  items: Array.from({ length: n }, (_, i) => ({ generacionId: `g${i + 1}`, grupo: i + 1, modelo: ['TRK 502', 'Leoncino', 'Imperiale'][i]!, costoEstimadoUsd: 0.045028 })),
  venceEn: '2026-10-28T12:15:00Z',
})

type Llamada = { url: string; init?: RequestInit }
function red(o: { estimar?: () => Response; confirmar?: () => Response; ejecutar?: (id: string) => Response | Promise<Response>; liberar?: () => Response } = {}) {
  const llamadas: Llamada[] = []
  const f = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    llamadas.push({ url, init })
    if (url === '/api/generaciones/lote') return (o.estimar ?? (() => json({ lote: loteEstimado(), mes: { gastadoUsd: 1.5, topeUsd: 10 }, excedeTope: false }, 201)))()
    if (url.endsWith('/confirmar')) return (o.confirmar ?? (() => json({ lote: { id: 'L1', estado: 'confirmado', costoEstimadoUsd: 0.135 }, items: [1, 2, 3].map((g) => ({ generacionId: `g${g}`, grupo: g })) })))()
    if (url.endsWith('/ejecutar')) {
      const id = url.split('/')[3]!
      return (o.ejecutar ?? ((x: string) => json({ generacion: { id: x, estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.045, error: null }, creativos: [creativo(`c-${x}`, x)] })))(id)
    }
    if (url.endsWith('/liberar')) return (o.liberar ?? (() => json({ liberadas: 2 })))()
    throw new Error(`URL inesperada ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return { f, llamadas }
}
const ejecuciones = (l: Llamada[]) => l.filter((x) => x.url.endsWith('/ejecutar')).map((x) => x.url)

const props = (o: Partial<React.ComponentProps<typeof ImagenesLote>> = {}) => ({
  tanda: tandaDe(),
  puede: true,
  listo: true,
  aviso: null,
  apagado: null,
  topeUsd: 10,
  motor: 'gemini-nano-banana-2.1',
  prepararse: vi.fn(async () => true),
  usarImagen: vi.fn(async (): Promise<string | null> => null),
  ...o,
})

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('<ImagenesLote> · Ver precio (no cuesta nada)', () => {
  it('una leyenda de una línea y 1 variante elegida por defecto', () => {
    render(<ImagenesLote {...props()} />)
    expect(screen.getByRole('heading', { name: 'Imágenes: una por moto' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /1 variante/i })).toBeChecked()
  })

  it('pide el precio con la tanda, las variantes y el motor (nunca un precio) y muestra el total', async () => {
    const r = red()
    render(<ImagenesLote {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    expect(await screen.findByRole('button', { name: /Confirmar US\$ 0,135084 · 3 imágenes \(3 motos × 1\)/ })).toBeInTheDocument()
    const est = r.llamadas.find((l) => l.url === '/api/generaciones/lote')!
    expect(JSON.parse(String(est.init!.body))).toEqual({ tandaId: 'T1', variantes: 1, motor: 'gemini-nano-banana-2.1' })
    expect(screen.getByText('TRK 502 · US$ 0,045028')).toBeInTheDocument()
    expect(screen.getByText('Leoncino · US$ 0,045028')).toBeInTheDocument()
    expect(screen.getByText(/Este mes ya se gastaron/)).toBeInTheDocument()
    // Estimar no confirma ni genera nada.
    expect(r.llamadas.filter((l) => l.url !== '/api/generaciones/lote')).toHaveLength(0)
  })

  it('con 2 variantes pide 2 y lo dice en el botón', async () => {
    const r = red({ estimar: () => json({ lote: { ...loteEstimado(), costoEstimadoUsd: 0.27 }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201) })
    render(<ImagenesLote {...props()} />)
    fireEvent.click(screen.getByRole('radio', { name: /2 variantes/i }))
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    expect(await screen.findByRole('button', { name: /Confirmar US\$ 0,2700 · 6 imágenes \(3 motos × 2\)/ })).toBeInTheDocument()
    expect(JSON.parse(String(r.llamadas[0]!.init!.body)).variantes).toBe(2)
  })

  it('antes de estimar aplica el diseño pendiente; si no se pudo aplicar, no estima', async () => {
    const r = red()
    const prepararse = vi.fn(async () => false)
    render(<ImagenesLote {...props({ prepararse })} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    await waitFor(() => expect(prepararse).toHaveBeenCalled())
    expect(r.llamadas).toHaveLength(0)
  })

  it('si supera el tope del mes, avisa y no deja confirmar', async () => {
    red({ estimar: () => json({ lote: loteEstimado(), mes: { gastadoUsd: 9.9, topeUsd: 10 }, excedeTope: true }, 201) })
    render(<ImagenesLote {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    expect(await screen.findByText(/Supera el tope del mes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeDisabled()
  })

  it('un error del servidor (ej. una moto sin diseño) se muestra en castellano', async () => {
    red({ estimar: () => json({ error: 'Moto 2 (Leoncino): Elegí un diseño primero.', grupo: 2 }, 422) })
    render(<ImagenesLote {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Moto 2 (Leoncino): Elegí un diseño primero.')
  })

  it('apagado, sin permiso o sin diseño: no se puede ver el precio, y dice por qué', () => {
    const { rerender } = render(<ImagenesLote {...props({ apagado: 'Sin PRESUPUESTO_MENSUAL_USD el Productor está apagado.' })} />)
    expect(screen.getByRole('button', { name: /Ver precio/ })).toBeDisabled()
    expect(screen.getByText(/Productor está apagado/)).toBeInTheDocument()
    rerender(<ImagenesLote {...props({ puede: false })} />)
    expect(screen.getByRole('button', { name: /Ver precio/ })).toBeDisabled()
    rerender(<ImagenesLote {...props({ listo: false, aviso: 'Primero elegí el diseño y el fondo.' })} />)
    expect(screen.getByRole('button', { name: /Ver precio/ })).toBeDisabled()
    expect(screen.getByText('Primero elegí el diseño y el fondo.')).toBeInTheDocument()
  })
})

describe('<ImagenesLote> · Confirmar y generar', () => {
  async function conPrecio(r = red(), p = props()) {
    render(<ImagenesLote {...p} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
    return { r, p }
  }

  it('confirma el lote UNA vez y después genera cada imagen (de a 2 en vuelo)', async () => {
    let enVuelo = 0
    let maximo = 0
    const r = red({
      ejecutar: async (id) => {
        enVuelo++
        maximo = Math.max(maximo, enVuelo)
        await new Promise((x) => setTimeout(x, 5))
        enVuelo--
        return json({ generacion: { id, estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.045, error: null }, creativos: [creativo(`c-${id}`, id)] })
      },
    })
    await conPrecio(r)
    expect(await screen.findByText(/Listo: 3 de 3 imágenes/)).toBeInTheDocument()
    expect(r.llamadas.filter((l) => l.url.endsWith('/confirmar'))).toHaveLength(1)
    expect(r.llamadas.filter((l) => l.url.endsWith('/confirmar'))[0]!.url).toBe('/api/generaciones/lote/L1/confirmar')
    expect(ejecuciones(r.llamadas).sort()).toEqual(['/api/generaciones/g1/ejecutar', '/api/generaciones/g2/ejecutar', '/api/generaciones/g3/ejecutar'])
    expect(maximo).toBeLessThanOrEqual(2)
    expect(router.refresh).toHaveBeenCalled()
  })

  it('no genera NADA hasta que la confirmación vuelve bien', async () => {
    const r = red({ confirmar: () => json({ error: 'Supera el tope mensual.', topeUsd: 10, restanteUsd: 0.05, gastadoUsd: 9.95, estimadoUsd: 0.135 }, 402) })
    await conPrecio(r)
    expect(await screen.findByText(/Supera el tope del mes: quedan US\$ 0,0500 de US\$ 10,0000/)).toBeInTheDocument()
    expect(ejecuciones(r.llamadas)).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeDisabled()
  })

  it('409 y 410 de la confirmación no generan y piden volver a ver el precio', async () => {
    for (const [status, texto] of [[409, /ya se confirmó/i], [410, /venció/i]] as const) {
      const r = red({ confirmar: () => json({ error: 'x' }, status) })
      const { unmount } = render(<ImagenesLote {...props()} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver precio/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(texto)
      expect(ejecuciones(r.llamadas)).toHaveLength(0)
      expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('muestra el progreso "Generando N de M" y el estado de cada moto; una que falla no frena a las demás', async () => {
    const r = red({
      ejecutar: (id) => (id === 'g2' ? json({ error: 'Se agotó la cuota de Gemini.' }, 500) : json({ generacion: { id, estado: 'ok', costoRealUsd: 0.04, costoEstimadoUsd: 0.045, error: null }, creativos: [creativo(`c-${id}`, id)] })),
    })
    await conPrecio(r)
    expect(await screen.findByText(/Listo: 2 de 3 imágenes/)).toBeInTheDocument()
    expect(screen.getByText(/Leoncino/, { selector: 'li *, li' })).toBeInTheDocument()
    expect(screen.getByText(/Se agotó la cuota de Gemini/)).toBeInTheDocument()
    expect(ejecuciones(r.llamadas)).toHaveLength(3)
  })

  it('con 1 variante, la imagen que salió se usa sola en las placas de esa moto', async () => {
    const p = props()
    await conPrecio(red(), p)
    await screen.findByText(/Listo: 3 de 3/)
    expect(p.usarImagen).toHaveBeenCalledTimes(3)
    expect(p.usarImagen).toHaveBeenCalledWith(1, 'c-g1')
    expect(p.usarImagen).toHaveBeenCalledWith(3, 'c-g3')
  })

  it('con 2 imágenes por moto NO elige por la persona: se elige abajo', async () => {
    const r = red({
      ejecutar: (id) => json({ generacion: { id, estado: 'ok', costoRealUsd: 0.08, costoEstimadoUsd: 0.09, error: null }, creativos: [creativo(`a-${id}`, id), { ...creativo(`b-${id}`, id), orden: 2 }] }),
    })
    const p = props()
    await conPrecio(r, p)
    await screen.findByText(/Listo: 3 de 3/)
    expect(p.usarImagen).not.toHaveBeenCalled()
  })

  it('el costo real se informa al terminar', async () => {
    await conPrecio()
    expect(await screen.findByText(/Costo real: US\$ 0,1200/)).toBeInTheDocument()
  })
})

describe('<ImagenesLote> · lo que quedó a mitad', () => {
  const pendientes = [
    { generacionId: 'g1', loteId: 'L1', grupo: 1, modelo: 'TRK 502', estado: 'confirmada' as const, interrumpida: false, costoEstimadoUsd: 0.045 },
    { generacionId: 'g2', loteId: 'L1', grupo: 2, modelo: 'Leoncino', estado: 'confirmada' as const, interrumpida: false, costoEstimadoUsd: 0.045 },
  ]

  it('avisa cuántas imágenes pagas quedaron sin generar y ofrece Generar (sin costo nuevo) y Liberar', () => {
    render(<ImagenesLote {...props({ tanda: tandaDe({ pendientes }) })} />)
    expect(screen.getByText(/2 imágenes pagas sin generar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generar \(sin costo nuevo\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Liberar/ })).toBeInTheDocument()
  })

  it('Generar corre SOLO las ejecuciones, sin estimar ni confirmar de nuevo', async () => {
    const r = red()
    render(<ImagenesLote {...props({ tanda: tandaDe({ pendientes }) })} />)
    fireEvent.click(screen.getByRole('button', { name: /Generar \(sin costo nuevo\)/ }))
    expect(await screen.findByText(/Listo: 2 de 2 imágenes/)).toBeInTheDocument()
    expect(r.llamadas.map((l) => l.url).sort()).toEqual(['/api/generaciones/g1/ejecutar', '/api/generaciones/g2/ejecutar'])
  })

  it('Liberar libera el lote (dejan de contar en el tope) y refresca', async () => {
    const r = red()
    render(<ImagenesLote {...props({ tanda: tandaDe({ pendientes }) })} />)
    fireEvent.click(screen.getByRole('button', { name: /Liberar/ }))
    expect(await screen.findByText(/2 imágenes liberadas/)).toBeInTheDocument()
    expect(r.llamadas.map((l) => l.url)).toEqual(['/api/generaciones/lote/L1/liberar'])
    expect(router.refresh).toHaveBeenCalled()
  })

  it('una imagen que se cortó a mitad (corriendo hace rato) no ofrece Generar: dice que se cortó', () => {
    const cortada = [{ ...pendientes[0]!, estado: 'corriendo' as const, interrumpida: true }]
    render(<ImagenesLote {...props({ tanda: tandaDe({ pendientes: cortada }) })} />)
    expect(screen.queryByRole('button', { name: /Generar \(sin costo nuevo\)/ })).not.toBeInTheDocument()
    expect(screen.getByText(/se cortó a mitad/i)).toBeInTheDocument()
  })

  it('sin permiso de edición no hay botones de generar ni liberar', () => {
    render(<ImagenesLote {...props({ puede: false, tanda: tandaDe({ pendientes }) })} />)
    expect(screen.getByRole('button', { name: /Generar \(sin costo nuevo\)/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Liberar/ })).toBeDisabled()
  })
})

describe('<ImagenesLote> · las imágenes de cada moto', () => {
  it('cada moto muestra sus imágenes, en cuántas placas se usa, y las puede usar en todas las placas de esa moto', async () => {
    const usarImagen = vi.fn(async (): Promise<string | null> => null)
    const tanda = tandaDe({ grupos: [grupo(1, 'TRK 502', [{ generacion: gen('g1', 'ok') as never, creativos: [creativo('c1', 'g1', 1), creativo('c2', 'g1', 0)] }], 2), grupo(2, 'Leoncino')] })
    render(<ImagenesLote {...props({ tanda, usarImagen })} />)
    const seccion = screen.getByRole('region', { name: /TRK 502/ })
    expect(within(seccion).getAllByRole('img')).toHaveLength(2)
    expect(within(seccion).getByText('En uso en 1 de 2 placas')).toBeInTheDocument()
    fireEvent.click(within(seccion).getAllByRole('button', { name: /Usar esta imagen en las 2 placas/ })[1]!)
    await waitFor(() => expect(usarImagen).toHaveBeenCalledWith(1, 'c2'))
    expect(screen.getByText(/Leoncino/)).toBeInTheDocument()
  })

  it('si la imagen no se pudo poner en las placas, lo dice junto a la imagen de ESA moto (no en silencio) y el botón manual reintenta', async () => {
    const usarImagen = vi.fn(async (): Promise<string | null> => 'Esa imagen no es de esta promoción.')
    const tanda = tandaDe({ grupos: [grupo(1, 'TRK 502', [{ generacion: gen('g1', 'ok') as never, creativos: [creativo('c1', 'g1', 0)] }]), grupo(2, 'Leoncino')] })
    render(<ImagenesLote {...props({ tanda, usarImagen })} />)
    const seccion = screen.getByRole('region', { name: /TRK 502/ })
    fireEvent.click(within(seccion).getByRole('button', { name: /Usar esta imagen en/ }))
    expect(await within(seccion).findByText(/No se pudo poner la imagen en las placas de TRK 502: Esa imagen no es de esta promoción/)).toBeInTheDocument()
    expect(screen.queryByText(/placas de Leoncino:/)).toBeNull()
    usarImagen.mockResolvedValueOnce(null)
    fireEvent.click(within(seccion).getByRole('button', { name: /Usar esta imagen en/ }))
    await waitFor(() => expect(within(seccion).queryByText(/No se pudo poner la imagen/)).toBeNull())
  })

  it('las que fallaron: "Volver a pedir precio de las fallidas" estima SOLO esas motos', async () => {
    const r = red({ estimar: () => json({ lote: loteEstimado(1), mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201) })
    const tanda = tandaDe({
      grupos: [
        grupo(1, 'TRK 502', [{ generacion: gen('g1', 'ok') as never, creativos: [creativo('c1', 'g1', 2)] }]),
        grupo(2, 'Leoncino', [{ generacion: gen('g2', 'error', { error: 'cuota' }) as never, creativos: [creativo('c2', 'g2', 0, null)] }]),
        grupo(3, 'Imperiale'),
      ],
    })
    render(<ImagenesLote {...props({ tanda })} />)
    fireEvent.click(screen.getByRole('button', { name: /Volver a pedir precio de las fallidas \(1\)/ }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(JSON.parse(String(r.llamadas[0]!.init!.body)).grupos).toEqual([2])
  })

  it('si algunas motos ya tienen imagen, ofrece ver el precio solo de las que no', async () => {
    const r = red({ estimar: () => json({ lote: loteEstimado(2), mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201) })
    const tanda = tandaDe({ grupos: [grupo(1, 'TRK 502', [{ generacion: gen('g1', 'ok') as never, creativos: [creativo('c1', 'g1', 2)] }]), grupo(2, 'Leoncino'), grupo(3, 'Imperiale')] })
    render(<ImagenesLote {...props({ tanda })} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio de las 2 que no tienen imagen/ }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(JSON.parse(String(r.llamadas[0]!.init!.body)).grupos).toEqual([2, 3])
  })
})
