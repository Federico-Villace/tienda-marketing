import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Tanda } from './tanda'
import { MARCAS } from '@/lib/datos/marcas'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'
import { vistaDePromocion } from '@/lib/promocion/vista'
import type { TandaVista } from '@/lib/promocion/tanda/pantalla'
import type { VerificacionVista } from '@/lib/promocion/copia/tipos'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const T = 't1'
const REF = 'ref-1'

type Copia = NonNullable<TandaVista['hijas'][number]['copia']>
const verif = (estado: VerificacionVista['estado'], o: Partial<VerificacionVista> = {}): VerificacionVista => ({ id: 'v1', estado, diferencias: [], avisos: [], puedeReverificar: false, costoReverificarUsd: null, ...o })
const difiere = verif('difiere', { diferencias: [{ campo: 'precio', motivo: 'distinto', esperado: '$ 4.500.000', leido: '$ 4.500.00' }] })

/** Una pieza de la tanda; `copia` en true = ya está en copia fiel con la referencia puesta. */
const hija = (i: number, o: Record<string, unknown> = {}, copia: boolean | Copia = true) => {
  const base = copia ? { plantilla: 'copia_fiel', fondo: null, inspiracion_foto_id: REF, inspiracion_modo: 'diseno' } : { plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }
  const promocion = vistaDePromocion(filaPromocion({ id: `h${i}`, marca_id: MARCAS[i]!.id, tanda_id: T, ...base, ...o } as never))
  return {
    promocion,
    marca: { id: MARCAS[i]!.id, nombre: MARCAS[i]!.nombre, usuarioIg: MARCAS[i]!.usuarioIg },
    miniatura: null as string | null,
    descarga: null as string | null,
    lista: false,
    copia: typeof copia === 'object' ? copia : copia ? ({ verificacion: null, textosVigentes: null, usable: false } as Copia) : null,
    textos: null as null,
  }
}
const tandaDe = (hijas = [hija(0), hija(1), hija(2)], o: Partial<TandaVista> = {}): TandaVista => ({
  tanda: { id: T, creadoEn: '2026-11-19T12:00:00+00:00' },
  tipo: 'marcas',
  hijas,
  grupos: [],
  pendientes: [],
  resumen: { total: hijas.length, aprobadas: 0, listas: 0 },
  comparten: { ok: true },
  foto: null,
  inspiracion: { id: REF, url: 'https://x/ref.jpg', borrada: false },
  escenas: [],
  gastadoUsd: 0,
  ...o,
})
const props = (o: Partial<React.ComponentProps<typeof Tanda>> = {}) => ({
  tanda: tandaDe(),
  puedeEditar: true,
  habilitado: true,
  costoAntecedentesUsd: 0.002,
  costoTextosUsd: 0.003,
  apagado: null,
  topeUsd: 10,
  motor: 'gemini-nano-banana-2.1',
  ...o,
})

const item = (o: Record<string, unknown> = {}) => ({ generacionId: 'g1', grupo: null, modelo: 'TRK 502', costoEstimadoUsd: 0.23724, copiaFiel: true, verificacionUsd: 0.05, hijaIds: ['h0', 'h1', 'h2'], ...o })
const lote = (items = [item()]) => ({ id: 'L1', copiaFiel: true, costoEstimadoUsd: items.reduce((t, i) => t + i.costoEstimadoUsd, 0), items, venceEn: '2026-11-19T12:15:00Z' })
const creativo = (id: string, generacionId: string, v: VerificacionVista | undefined, usadaEn = 0) => ({ id, generacionId, orden: 1, url: `https://x/${id}.jpg`, ancho: 1, alto: 1, costoUsd: 0.04, error: null, elegida: false, usadaEn, ...(v ? { verificacion: v } : {}) })
const escena = (generacionId: string, creativos: ReturnType<typeof creativo>[], sirveA: string[], o: Record<string, unknown> = {}) => ({
  generacion: { id: generacionId, estado: 'ok', motor: 'gemini-3-pro-image', cantidad: 1, costoEstimadoUsd: 0.23, costoRealUsd: 0.16, error: null, creadoEn: '2026-11-19T12:00:00Z', interrumpida: false, copiaFiel: true, textosVigentes: sirveA.length > 0, ...o },
  creativos,
  sirveA,
})

type Llamada = { url: string; init?: RequestInit }
function red(o: { estimar?: () => Response; ejecutar?: (id: string) => Response } = {}) {
  const llamadas: Llamada[] = []
  const f = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    llamadas.push({ url, init })
    if (url === '/api/generaciones/lote') return (o.estimar ?? (() => json({ lote: lote(), mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201)))()
    if (url.endsWith('/confirmar')) return json({ lote: { id: 'L1', estado: 'confirmado', costoEstimadoUsd: 0.23724 }, items: [{ generacionId: 'g1', grupo: null }] })
    if (url.endsWith('/ejecutar')) {
      const id = url.split('/')[3]!
      return (o.ejecutar ?? ((x: string) => json({ generacion: { id: x, estado: 'ok', costoRealUsd: 0.16, costoEstimadoUsd: 0.23724, error: null }, creativos: [creativo('c1', x, verif('ok'))] })))(id)
    }
    if (url.startsWith('/api/promociones/')) return json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })), avisos: [] })
    throw new Error(`URL inesperada ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return { f, llamadas }
}
const de = (l: Llamada[], fin: string) => l.filter((x) => x.url.endsWith(fin))
const cuerpo = (l: Llamada) => JSON.parse(String(l.init?.body))

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('<Tanda> con copia fiel · la compuerta de costo', () => {
  it('sin fondo que elegir: Ver precio pide UN total de imágenes + revisión de textos al lote y no confirma solo', async () => {
    const { llamadas } = red()
    render(<Tanda {...props()} />)
    expect(screen.queryByRole('radiogroup', { name: 'Estilo' })).toBeNull()
    expect(screen.queryByText('Fondo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: /Confirmar/ })).toBeInTheDocument()
    expect(llamadas.map((l) => l.url)).toEqual(['/api/generaciones/lote'])
    // El motor por defecto del modo es el que escribe mejor, y NUNCA viaja un precio.
    expect(cuerpo(llamadas[0]!)).toEqual({ tandaId: T, variantes: 2, motor: 'gemini-3-pro-image' })
    expect(screen.getByText(/2 imágenes \+ revisión de textos para 3 piezas/)).toBeInTheDocument()
    expect(screen.getByText(/incluye la revisión de los textos/i)).toBeInTheDocument()
  })

  it('Confirmar es el único click que gasta, y un doble click no confirma ni genera dos veces', async () => {
    const { llamadas } = red()
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    const confirmar = await screen.findByRole('button', { name: /Confirmar/ })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => expect(de(llamadas, '/ejecutar')).toHaveLength(1))
    expect(de(llamadas, '/confirmar')).toHaveLength(1)
    // Con una sola imagen revisada OK, queda en las piezas que piden esos textos.
    await waitFor(() => expect(llamadas.filter((l) => l.url.startsWith('/api/promociones/'))).toHaveLength(3))
    for (const l of llamadas.filter((x) => x.url.startsWith('/api/promociones/'))) expect(cuerpo(l)).toMatchObject({ escenaCreativoId: 'c1' })
  })

  it('una imagen cuyos textos NO coinciden no se pone en ninguna pieza, aunque sea la única', async () => {
    const { llamadas } = red({ ejecutar: (x) => json({ generacion: { id: x, estado: 'ok', costoRealUsd: 0.16, costoEstimadoUsd: 0.23, error: null }, creativos: [creativo('c1', x, difiere)] }) })
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }))
    await waitFor(() => expect(de(llamadas, '/ejecutar')).toHaveLength(1))
    await screen.findByText(/Listo: 1 de 1 imágenes/)
    expect(llamadas.filter((l) => l.url.startsWith('/api/promociones/'))).toHaveLength(0)
    expect(screen.getByText(/los textos no coinciden/i)).toBeInTheDocument()
  })

  it('si supera el tope del mes no deja confirmar', async () => {
    red({ estimar: () => json({ lote: lote(), mes: { gastadoUsd: 9.9, topeUsd: 10 }, excedeTope: true }, 201) })
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: /Confirmar/ })).toBeDisabled()
  })

  it('un lector no ve ningún control de la copia fiel ni de generar', () => {
    render(<Tanda {...props({ puedeEditar: false, tanda: tandaDe([hija(0, {}, { verificacion: verif('error', { puedeReverificar: true, costoReverificarUsd: 0.05 }), textosVigentes: true, usable: false })]) })} />)
    expect(screen.queryByRole('button', { name: 'Ver precio' })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Copia fiel/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Revisar de nuevo/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Generar otra/ })).toBeNull()
  })
})

describe('<Tanda> con copia fiel · aplicar a todas', () => {
  it('elegir la copia fiel y Aplicar manda a cada pieza la plantilla, la referencia (una sola vez) y los textos sacados; sin fondo', async () => {
    const { llamadas } = red()
    render(<Tanda {...props({ tanda: tandaDe([hija(0, {}, false), hija(1, {}, false), hija(2, {}, false)]) })} />)
    fireEvent.click(screen.getByRole('radio', { name: /Copia fiel de tu referencia/ }))
    fireEvent.click(within(screen.getByTestId('mostrar-textos')).getByRole('checkbox', { name: 'Precio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    await waitFor(() => expect(llamadas.filter((l) => l.url.startsWith('/api/promociones/'))).toHaveLength(3))
    const patches = llamadas.filter((l) => l.url.startsWith('/api/promociones/'))
    for (const l of patches) expect(cuerpo(l)).toEqual({ revision: 1, plantilla: 'copia_fiel', inspiracionFotoId: REF, inspiracionModo: 'diseno', diseno: { ocultos: ['precio'] } })
    expect(patches.map((l) => l.url)).toEqual(['/api/promociones/h0', '/api/promociones/h1', '/api/promociones/h2'])
  })

  it('pasar de la copia fiel a otra plantilla NO pisa en silencio: lista lo que reemplaza y espera "Aplicar igual"', async () => {
    const { llamadas } = red()
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('radio', { name: /Plantilla de diseño y fondo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Esto reemplaza' })
    expect(within(dialogo).getAllByText(/Copia fiel de tu referencia/)).toHaveLength(3)
    expect(llamadas).toHaveLength(0)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar igual' }))
    await waitFor(() => expect(llamadas.filter((l) => l.url.startsWith('/api/promociones/'))).toHaveLength(3))
    expect(cuerpo(llamadas[0]!)).toMatchObject({ plantilla: 'oferta_abajo' })
  })

  it('"Cancelar" no manda nada y las piezas siguen en copia fiel', async () => {
    const { llamadas } = red()
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('radio', { name: /Plantilla de diseño y fondo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(llamadas).toHaveLength(0)
  })

  it('con "Ver precio" y cambios sin aplicar que pisarían la copia fiel de una pieza, pide confirmar y no estima', async () => {
    const { llamadas } = red()
    render(<Tanda {...props({ tanda: tandaDe([hija(0), hija(1, {}, false)]) })} />)
    // La tanda parte de la primera pieza (copia fiel); una de ellas tiene otra plantilla: aplicar las iguala y avisa.
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('alertdialog', { name: 'Esto reemplaza' })).toBeInTheDocument()
    expect(llamadas).toHaveLength(0)
  })
})

describe('<Tanda> con copia fiel · cada pieza y su revisión de textos', () => {
  const lista = { copy: copyDePrueba(), escena_creativo_id: 'c1' }

  it('una pieza cuya imagen "difiere" no queda lista ni entra en "Aprobar todas", y muestra las diferencias', () => {
    const piezas = [hija(0, lista, { verificacion: difiere, textosVigentes: true, usable: false }), hija(1, lista, { verificacion: verif('ok'), textosVigentes: true, usable: true })]
    render(<Tanda {...props({ tanda: tandaDe(piezas) })} />)
    expect(screen.getByRole('button', { name: 'Aprobar todas las listas (1)' })).toBeEnabled()
    // Las piezas son los <li> de la sección (las diferencias de adentro también son <li>).
    const tarjetas = [0, 1].map((i) => within(screen.getByRole('region', { name: 'Piezas' })).getByText(MARCAS[i]!.nombre).closest('li')!)
    expect(within(tarjetas[0]!).getByText(/Los textos no coinciden/)).toBeInTheDocument()
    expect(within(tarjetas[0]!).getByText(/Precio: dice «\$ 4\.500\.00»/)).toBeInTheDocument()
    expect(within(tarjetas[0]!).getByText(/Falta: .*imagen con los textos revisados/)).toBeInTheDocument()
    expect(within(tarjetas[1]!).getByText('Lista para aprobar')).toBeInTheDocument()
    expect(within(tarjetas[1]!).getByText('✓ Textos revisados')).toBeInTheDocument()
  })

  it('sin ninguna usable, "Aprobar todas" no hace nada', () => {
    render(<Tanda {...props({ tanda: tandaDe([hija(0, lista, { verificacion: difiere, textosVigentes: true, usable: false })]) })} />)
    expect(screen.getByRole('button', { name: 'Aprobar todas las listas (0)' })).toBeDisabled()
  })

  it('si cambiaron los textos después de generar, la pieza lo dice y manda a generar otra por SU propia compuerta (su paso 4)', () => {
    render(<Tanda {...props({ tanda: tandaDe([hija(0, lista, { verificacion: verif('ok'), textosVigentes: false, usable: false })]) })} />)
    const tarjeta = within(screen.getByRole('region', { name: 'Piezas' })).getByText(MARCAS[0]!.nombre).closest('li')!
    expect(within(tarjeta).getByText(/Cambiaste los textos/)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Generar otra para esta pieza' })).toHaveAttribute('href', '/promocionar/h0?paso=4')
  })

  it('si la revisión falló, se repite con su propio precio y Confirmar (un click = un pedido), sobre la imagen de ESA pieza', async () => {
    const f = vi.fn(async () => json({ verificacion: verif('ok'), costoUsd: 0.01 }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaDe([hija(0, lista, { verificacion: verif('error', { puedeReverificar: true, costoReverificarUsd: 0.05 }), textosVigentes: true, usable: false })]) })} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar de nuevo/ }))
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/creativos/c1/verificacion')
    expect(JSON.parse(String(init.body))).toEqual({ aceptadoUsd: 0.05 })
  })

  it('"Usar esta imagen" va solo a las piezas que piden esos textos, y no se puede con textos que no coinciden', async () => {
    const { llamadas } = red()
    const escenas = [escena('g1', [creativo('c-ok', 'g1', verif('ok'))], ['h0', 'h1']), escena('g2', [creativo('c-mal', 'g2', difiere)], ['h2'])]
    render(<Tanda {...props({ tanda: tandaDe(undefined, { escenas }) })} />)
    const botones = screen.getAllByRole('button', { name: 'Usar esta imagen en las piezas que piden estos textos' })
    expect(botones).toHaveLength(2)
    expect(botones[1]).toBeDisabled()
    expect(screen.getByText('Los textos no coinciden: no se puede usar')).toBeInTheDocument()
    fireEvent.click(botones[0]!)
    await waitFor(() => expect(llamadas.filter((l) => l.url.startsWith('/api/promociones/'))).toHaveLength(2))
    expect(llamadas.map((l) => l.url)).toEqual(['/api/promociones/h0', '/api/promociones/h1'])
  })

  it('una imagen sin revisar o que no es de la copia fiel tampoco se puede usar', () => {
    const escenas = [escena('g1', [creativo('c1', 'g1', undefined)], ['h0']), escena('g2', [creativo('c2', 'g2', verif('ok'))], ['h0'], { copiaFiel: undefined })]
    render(<Tanda {...props({ tanda: tandaDe(undefined, { escenas }) })} />)
    for (const b of screen.getAllByRole('button', { name: 'Usar esta imagen en las piezas que piden estos textos' })) expect(b).toBeDisabled()
    expect(screen.getByText('Sin revisar todavía: no se puede usar')).toBeInTheDocument()
    expect(screen.getByText('No es de la copia fiel: no se puede usar')).toBeInTheDocument()
  })
})

describe('<Tanda> con copia fiel · un lote de motos y uno de textos', () => {
  it('un lote de textos estima por la compuerta de lote: una imagen por texto', async () => {
    const { llamadas } = red({
      estimar: () => json({ lote: lote([item({ hijaIds: ['h0'], generacionId: 'g1' }), item({ hijaIds: ['h1'], generacionId: 'g2' })]), mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201),
    })
    const piezas = [hija(0, { variante: 1 }), hija(0, { id: 'h1', variante: 2 })]
    render(<Tanda {...props({ tanda: tandaDe(piezas, { tipo: 'textos' }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByText(/4 imágenes \+ revisión de textos para 2 piezas/)).toBeInTheDocument()
    expect(llamadas[0]!.url).toBe('/api/generaciones/lote')
    expect(cuerpo(llamadas[0]!)).not.toHaveProperty('grupos')
  })

  it('un lote de motos usa la misma compuerta en vez de la de una imagen por moto', async () => {
    red({ estimar: () => json({ lote: lote([item({ grupo: 1, hijaIds: ['h0'] }), item({ grupo: 2, hijaIds: ['h1'], generacionId: 'g2' })]), mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201) })
    const piezas = [hija(0, { grupo: 1 }), hija(1, { grupo: 2 })]
    render(<Tanda {...props({ tanda: tandaDe(piezas, { tipo: 'motos', grupos: [{ grupo: 1, modelo: 'TRK 502', hijaIds: ['h0'], foto: null, comparten: { ok: true }, escenas: [] }, { grupo: 2, modelo: 'Leoncino', hijaIds: ['h1'], foto: null, comparten: { ok: true }, escenas: [] }] }) })} />)
    expect(screen.queryByRole('heading', { name: 'Imágenes: una por moto' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Imágenes de la copia fiel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByText(/Moto 1 · TRK 502/)).toBeInTheDocument()
  })
})
