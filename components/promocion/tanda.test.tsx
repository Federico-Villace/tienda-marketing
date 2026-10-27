import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { Tanda } from './tanda'
import { MARCAS } from '@/lib/datos/marcas'
import { filaPromocion, copyDePrueba } from '@/lib/promocion/fixture'
import { vistaDePromocion } from '@/lib/promocion/vista'
import type { TandaVista } from '@/lib/promocion/tanda/pantalla'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const T = 't1'

const hija = (i: number, o: Record<string, unknown> = {}) => {
  const promocion = vistaDePromocion(filaPromocion({ id: `h${i}`, marca_id: MARCAS[i]!.id, tanda_id: T, plantilla: 'oferta_abajo', fondo: 'fondo_estudio', ...o } as never))
  return { promocion, marca: { id: MARCAS[i]!.id, nombre: MARCAS[i]!.nombre, usuarioIg: MARCAS[i]!.usuarioIg }, miniatura: null as string | null, lista: false }
}
const lista = { copy: copyDePrueba(), escena_creativo_id: 'e1', titular: 'Hola' }

const tandaDe = (hijas = [hija(2), hija(3), hija(5)], o: Partial<TandaVista> = {}): TandaVista => ({
  tanda: { id: T, creadoEn: '2026-10-25T12:00:00+00:00' },
  hijas,
  resumen: { total: hijas.length, aprobadas: 0, listas: 0 },
  comparten: { ok: true },
  foto: null,
  inspiracion: null,
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

beforeEach(() => {
  router.refresh.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const rutaDe = (c: unknown) => new URL(String(c), 'http://x').pathname

describe('<Tanda> · lo que se ve', () => {
  it('resume: modelo, cuántas marcas y cuántas aprobadas', () => {
    render(<Tanda {...props({ tanda: tandaDe([hija(2), hija(3, { estado: 'aprobada', placa_ruta: 'r', placa_hash: 'h', copy: copyDePrueba(), escena_creativo_id: 'e1' })]) })} />)
    expect(screen.getByText(/TRK 502 · 2 marcas · 1 de 2 aprobadas/)).toBeInTheDocument()
  })

  it('una tarjeta por marca con su estado y un link a abrirla', () => {
    render(<Tanda {...props()} />)
    const piezas = screen.getByRole('region', { name: 'Piezas' })
    expect(within(piezas).getAllByRole('listitem')).toHaveLength(3)
    expect(within(piezas).getByText(MARCAS[2]!.nombre)).toBeInTheDocument()
    expect(within(piezas).getAllByRole('link', { name: 'Abrir' })[0]).toHaveAttribute('href', '/promocionar/h2?paso=2')
  })

  it('las descartadas no se muestran', () => {
    render(<Tanda {...props({ tanda: tandaDe([hija(2), hija(3, { estado: 'descartada' })]) })} />)
    expect(within(screen.getByRole('region', { name: 'Piezas' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('los botones de lote muestran el TOTAL antes del click (regla #3)', () => {
    render(<Tanda {...props()} />)
    expect(screen.getByRole('button', { name: 'Analizar las 3 · ~US$ 0,006 (3 × ~US$ 0,002)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir textos de las 3 · ~US$ 0,009 (3 × ~US$ 0,003)' })).toBeInTheDocument()
  })

  it('un lector ve las piezas pero ninguna acción en lote', () => {
    render(<Tanda {...props({ puedeEditar: false })} />)
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Piezas' })).toBeInTheDocument()
  })
})

describe('<Tanda> · rechazos: cero llamadas', () => {
  it('sin clave de OpenAI los lotes de texto están apagados y lo dice', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ habilitado: false })} />)
    expect(screen.getByText(/falta la clave de OpenAI/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Analizar las 3/ }))
    fireEvent.click(screen.getByRole('button', { name: /Escribir textos de las 3/ }))
    expect(f).not.toHaveBeenCalled()
  })

  it('con la imagen apagada, Ver precio no hace nada', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ apagado: 'Generar imágenes está apagado: falta la clave de Gemini.' })} />)
    expect(screen.getByText(/falta la clave de Gemini/)).toBeInTheDocument()
    const ver = screen.getByRole('button', { name: 'Ver precio' })
    expect(ver).toBeDisabled()
    fireEvent.click(ver)
    expect(f).not.toHaveBeenCalled()
  })

  it('si las hijas piden escenas distintas, no se puede ver el precio y dice qué difiere', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaDe(undefined, { comparten: { ok: false, difieren: ['fondo', 'formato'] } }) })} />)
    expect(screen.getByText(/Difiere: fondo, formato/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(f).not.toHaveBeenCalled()
  })

  it('"Aprobar todas" no hace nada si ninguna está lista', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    const b = screen.getByRole('button', { name: 'Aprobar todas las listas (0)' })
    expect(b).toBeDisabled()
    fireEvent.click(b)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('<Tanda> · período', () => {
  it('Analizar las N manda a cada promoción el período de la pantalla', async () => {
    const f = vi.fn(async (u: string) => json({ analisis: {}, desdeCache: false, promocion: vistaDePromocion(filaPromocion({ id: String(u).split('/')[3], revision: 2 })) }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ periodo: { desde: '2026-09-01', hasta: '2026-09-30' } })} />)
    fireEvent.click(screen.getByRole('button', { name: /Analizar las 3/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    for (const [, init] of f.mock.calls as unknown as [string, RequestInit][]) {
      expect(JSON.parse(String(init.body))).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    }
  })
})

describe('<Tanda> · lotes', () => {
  it('Escribir textos llama al endpoint de cada promoción, con la revisión de cada una', async () => {
    const f = vi.fn(async (u: string) => json({ textos: {}, promocion: { ...vistaDePromocion(filaPromocion({ id: String(u).split('/')[3], revision: 2 })) } }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Escribir textos de las 3/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    expect(f.mock.calls.map(([u]) => String(u)).sort()).toEqual(['/api/promociones/h2/textos', '/api/promociones/h3/textos', '/api/promociones/h5/textos'])
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ revision: 1 })
    expect(await screen.findByText('3 textos escritos')).toBeInTheDocument()
  })

  it('nunca hay más de 3 llamadas en vuelo', async () => {
    let activas = 0
    let max = 0
    const f = vi.fn(async () => {
      activas++
      max = Math.max(max, activas)
      await new Promise((r) => setTimeout(r, 5))
      activas--
      return json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })) })
    })
    vi.stubGlobal('fetch', f)
    const hijas = [0, 1, 2, 3, 4, 5, 6].map((i) => hija(i))
    render(<Tanda {...props({ tanda: tandaDe(hijas) })} />)
    fireEvent.click(screen.getByRole('button', { name: /Escribir textos de las 7/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(7))
    await screen.findByText(/7 textos escritos/)
    expect(max).toBe(3)
  })

  it('un error en una tarjeta no frena a las otras, se ve en esa tarjeta y se puede reintentar', async () => {
    let intento = 0
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('/h3/')) {
        intento++
        return intento === 1 ? json({ error: 'El modelo tardó demasiado.' }, 504) : json({ textos: {}, promocion: vistaDePromocion(filaPromocion({ id: 'h3', revision: 2 })) })
      }
      return json({ textos: {}, promocion: vistaDePromocion(filaPromocion({ id: 'x', revision: 2 })) })
    })
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Escribir textos de las 3/ }))
    expect(await screen.findByText('2 textos escritos, 1 con error')).toBeInTheDocument()
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('El modelo tardó demasiado.')
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(f).toHaveBeenCalledTimes(4)
  })

  it('un doble click no lanza dos lotes', async () => {
    let terminar!: () => void
    const f = vi.fn(() => new Promise<Response>((res) => (terminar = () => res(json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })) })))))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaDe([hija(2)]) })} />)
    const b = screen.getByRole('button', { name: /Escribir textos de las 1/ })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(f).toHaveBeenCalledTimes(1)
    terminar()
    await screen.findByText(/1 texto escrito/)
  })

  it('Aplicar diseño y fondo hace un PATCH por promoción', async () => {
    const f = vi.fn(async () => json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })), avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('radio', { name: /Escenario en la ruta|Ruta/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toMatchObject({ revision: 1, plantilla: 'oferta_abajo', fondo: 'escenario_ruta' })
  })

  it('Aprobar todas las listas aprueba solo esas, y un error en una no frena a las otras', async () => {
    const f = vi.fn(async (u: string) =>
      String(u).includes('/h3') ? json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409) : json({ promocion: vistaDePromocion(filaPromocion({ id: 'x', estado: 'aprobada', revision: 2, copy: copyDePrueba(), placa_ruta: 'r', placa_hash: 'h' })) }),
    )
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaDe([hija(2, lista), hija(3, lista), hija(5)]) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar todas las listas (2)' }))
    expect(await screen.findByText('1 aprobada, 1 con error')).toBeInTheDocument()
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 1, accion: 'aprobar' })
    expect(f.mock.calls.map(([u]) => rutaDe(u))).not.toContain('/api/promociones/h5')
  })
})

describe('<Tanda> · imagen compartida (compuerta de costo)', () => {
  const estimacion = { generacion: { id: 'g1', motor: 'm', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.02, listaUsd: 0.04, costoEstimadoUsd: 0.08, venceEn: 'x', promociones: 3, origen: 'tanda' }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }

  it('Ver precio estima UNA imagen para la tanda y muestra el total y lo que costaría una por marca; no confirma solo', async () => {
    const f = vi.fn(async () => json(estimacion, 201))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: /Confirmar/ })).toBeInTheDocument()
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ tandaId: T, motor: 'gemini-nano-banana-2.1', cantidad: 2 })
    expect(screen.getByText(/2 imágenes para 3 promociones/)).toBeInTheDocument()
    expect(screen.getByText(/Una imagen por marca serían/)).toBeInTheDocument()
  })

  it('Confirmar es el único click que gasta', async () => {
    const f = vi.fn(async (u: string) => (String(u).endsWith('/confirmar') ? json({ generacion: { id: 'g1', estado: 'ok', costoRealUsd: 0.07, costoEstimadoUsd: 0.08, error: null }, creativos: [] }) : json(estimacion, 201)))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }))
    await waitFor(() => expect(f.mock.calls.map(([u]) => String(u))).toContain('/api/generaciones/g1/confirmar'))
  })

  it('las imágenes ya generadas se pueden usar en todas las promociones', async () => {
    const f = vi.fn(async () => json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })), avisos: [] }))
    vi.stubGlobal('fetch', f)
    const escenas = [{ generacion: { id: 'g1' } as never, creativos: [{ id: 'c1', generacionId: 'g1', orden: 1, url: 'https://x/c1.jpg', ancho: 1, alto: 1, costoUsd: 0, error: null, elegida: false, usadaEn: 0 }] }]
    render(<Tanda {...props({ tanda: tandaDe(undefined, { escenas }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta imagen en las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 1, escenaCreativoId: 'c1' })
  })
})
