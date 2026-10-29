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
  tipo: 'marcas',
  hijas,
  grupos: [],
  pendientes: [],
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
    const escenas = [{ generacion: { id: 'g1', estado: 'ok', motor: 'm', cantidad: 1, costoEstimadoUsd: 0.045, costoRealUsd: 0.04, error: null, creadoEn: '2026-10-25T12:00:00Z', interrumpida: false }, creativos: [{ id: 'c1', generacionId: 'g1', orden: 1, url: 'https://x/c1.jpg', ancho: 1, alto: 1, costoUsd: 0, error: null, elegida: false, usadaEn: 0 }] }]
    render(<Tanda {...props({ tanda: tandaDe(undefined, { escenas }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta imagen en las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 1, escenaCreativoId: 'c1' })
  })
})


describe('<Tanda> · los mismos campos de la placa para todas', () => {
  const ok = () => json({ promocion: vistaDePromocion(filaPromocion({ revision: 2 })), avisos: [] })
  const cuerpo = (f: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(String((f.mock.calls[i] as unknown as [string, RequestInit])[1].body))
  const grupo = (n: string) => within(screen.getByRole('radiogroup', { name: n }))

  it('ofrece estilo, dónde va el texto y dónde va la moto, una descripción, la línea extra y la foto de inspiración', () => {
    render(<Tanda {...props()} />)
    expect(grupo('Estilo').getAllByRole('radio')).toHaveLength(2)
    expect(grupo('Dónde va el texto').getAllByRole('radio')).toHaveLength(3)
    expect(grupo('Dónde va la moto').getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByLabelText('Descripción del fondo (opcional)')).toHaveAttribute('maxlength', '300')
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveAttribute('maxlength', '60')
    expect(screen.getByLabelText(/Elegir una foto de inspiración/)).toBeInTheDocument()
  })

  it('parte de lo que ya tienen las promociones', () => {
    const t = tandaDe([hija(2, { plantilla: 'catalogo_arriba', fondo: 'escenario_ruta', posicion_moto: 'derecha', fondo_descripcion: 'de noche', linea_extra: 'Hot Sale' })])
    render(<Tanda {...props({ tanda: t })} />)
    expect(grupo('Estilo').getByRole('radio', { name: /Panel liso/ })).toBeChecked()
    expect(grupo('Dónde va el texto').getByRole('radio', { name: /Arriba/ })).toBeChecked()
    expect(grupo('Dónde va la moto').getByRole('radio', { name: /Derecha/ })).toBeChecked()
    expect(screen.getByLabelText('Descripción del fondo (opcional)')).toHaveValue('de noche')
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveValue('Hot Sale')
  })

  it('Aplicar manda todo a cada promoción en un solo PATCH, con la revisión de cada una', async () => {
    const f = vi.fn(async () => ok())
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(grupo('Estilo').getByRole('radio', { name: /Panel liso/ }))
    fireEvent.click(grupo('Dónde va el texto').getByRole('radio', { name: /Arriba/ }))
    fireEvent.click(grupo('Dónde va la moto').getByRole('radio', { name: /Izquierda/ }))
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: ' Calle de noche ' } })
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: ' Hot Sale · Solo este fin de semana ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    expect(cuerpo(f)).toEqual({
      revision: 1,
      plantilla: 'catalogo_arriba',
      // Escribir la primera descripción con el estudio por defecto pasa a "solo mi descripción".
      fondo: 'solo_descripcion',
      posicionMoto: 'izquierda',
      fondoDescripcion: 'Calle de noche',
      lineaExtra: 'Hot Sale · Solo este fin de semana',
      inspiracionFotoId: null,
    })
    expect(f.mock.calls.map((c) => rutaDe((c as unknown as [string])[0]))).toEqual(['/api/promociones/h2', '/api/promociones/h3', '/api/promociones/h5'])
  })

  it('vaciar la descripción o la línea extra las borra en todas', async () => {
    const f = vi.fn(async () => ok())
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaDe([hija(2, { fondo_descripcion: 'x', linea_extra: 'y' })]) })} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 1' }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpo(f)).toMatchObject({ fondoDescripcion: null, lineaExtra: null })
  })

  it('al costado la moto no puede ir al centro: se pasa a la izquierda y "Centro" queda deshabilitado', async () => {
    const f = vi.fn(async () => ok())
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(grupo('Dónde va el texto').getByRole('radio', { name: /Al costado/ }))
    expect(grupo('Dónde va la moto').getByRole('radio', { name: /Centro/ })).toBeDisabled()
    expect(grupo('Dónde va la moto').getByRole('radio', { name: /Izquierda/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpo(f)).toMatchObject({ plantilla: 'oferta_costado', posicionMoto: 'izquierda' })
  })

  it('el contador y el máximo siguen a dónde va el texto', () => {
    render(<Tanda {...props()} />)
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveAttribute('maxlength', '60')
    fireEvent.click(grupo('Dónde va el texto').getByRole('radio', { name: /Al costado/ }))
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveAttribute('maxlength', '36')
  })

  it('con emojis en la línea extra no deja aplicar y lo explica', () => {
    render(<Tanda {...props()} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hot Sale 🔥' } })
    expect(screen.getByText(/No puede llevar emojis/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aplicar a las 3' })).toBeDisabled()
  })

  it('la foto de inspiración se sube una vez y se aplica a todas con "Aplicar"', async () => {
    const comprimir = vi.fn(async () => ({ ok: true as const, blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1200, alto: 800 }))
    const f = vi.fn(async (u: string) => (u === '/api/fotos' ? json({ foto: { id: 'i9', ancho: 1200, alto: 800, url: 'https://x/i9.jpg' } }, 201) : ok()))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ comprimirFoto: comprimir })} />)
    fireEvent.change(screen.getByLabelText(/Elegir una foto de inspiración/), { target: { files: [new File([new Uint8Array([9])], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByLabelText(/Tengo derecho a usar esta foto/))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    expect(await screen.findByAltText('Foto de inspiración')).toHaveAttribute('src', 'https://x/i9.jpg')
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData).get('uso')).toBe('inspiracion')
    expect(f).toHaveBeenCalledTimes(1) // todavía no se aplicó a nadie
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 3' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(4))
    expect(cuerpo(f, 1)).toMatchObject({ inspiracionFotoId: 'i9' })
  })

  it('con foto de inspiración compartida la muestra y deja quitarla', async () => {
    const f = vi.fn(async () => ok())
    vi.stubGlobal('fetch', f)
    const t = tandaDe([hija(2, { inspiracion_foto_id: 'i1' })], { inspiracion: { id: 'i1', url: 'https://x/i1.jpg', borrada: false } })
    render(<Tanda {...props({ tanda: t })} />)
    expect(screen.getByAltText('Foto de inspiración')).toHaveAttribute('src', 'https://x/i1.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la foto de inspiración' }))
    expect(screen.queryByAltText('Foto de inspiración')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a las 1' }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpo(f)).toMatchObject({ inspiracionFotoId: null })
  })

  it('el aviso de "no comparten" nombra lo nuevo', () => {
    render(<Tanda {...props({ tanda: tandaDe(undefined, { comparten: { ok: false, difieren: ['foto de inspiración'] } }) })} />)
    expect(screen.getByText(/dónde va el texto, el fondo, la descripción, dónde va la moto y la foto de inspiración/)).toBeInTheDocument()
    expect(screen.getByText(/Difiere: foto de inspiración/)).toBeInTheDocument()
  })

  it('el precio de la imagen compartida avisa si incluye la inspiración', async () => {
    const f = vi.fn(async () => json({ generacion: { id: 'g1', motor: 'm', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.02, listaUsd: 0.04, costoEstimadoUsd: 0.0934, venceEn: 'x', promociones: 3, origen: 'tanda', conInspiracion: true }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByText(/Incluye la foto de inspiración/)).toBeInTheDocument()
  })

  it('un lector no ve nada de esto (el aviso de solo lectura lo da la página)', () => {
    render(<Tanda {...props({ puedeEditar: false })} />)
    expect(screen.queryByLabelText('Línea extra (opcional)')).toBeNull()
  })
})

describe('<Tanda> · nada se pierde sin aplicar, el fondo y con qué se generó', () => {
  const estimacion = (o: Record<string, unknown> = {}) => ({ generacion: { id: 'g1', motor: 'm', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.02, listaUsd: 0.04, costoEstimadoUsd: 0.08, venceEn: 'x', promociones: 3, origen: 'tanda', ...o }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false })
  const ok = (u: string) => json({ promocion: vistaDePromocion(filaPromocion({ id: rutaDe(u).split('/')[3], revision: 2, tanda_id: T, plantilla: 'oferta_abajo', fondo: 'solo_descripcion', fondo_descripcion: 'de noche' } as never)), avisos: [] })

  it('BUG H1 en la tanda: escribir la descripción y tocar "Ver precio" sin "Aplicar" => primero se aplica a todas y DESPUÉS se estima', async () => {
    const f = vi.fn(async (u: string) => (String(u) === '/api/generaciones' ? json(estimacion(), 201) : ok(String(u))))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    expect(screen.getByText(/Hay cambios sin aplicar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: /Confirmar/ })).toBeInTheDocument()
    expect(f.mock.calls.map((c) => rutaDe((c as unknown as [string])[0]))).toEqual(['/api/promociones/h2', '/api/promociones/h3', '/api/promociones/h5', '/api/generaciones'])
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ fondo: 'solo_descripcion', fondoDescripcion: 'de noche' })
  })

  it('si aplicar falla en alguna, NO se estima', async () => {
    const f = vi.fn(async (u: string) => (rutaDe(u) === '/api/promociones/h3' ? json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409) : ok(String(u))))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByText('Esta promoción cambió: recargá la pantalla.')).toBeInTheDocument()
    expect(f.mock.calls.some((c) => String((c as unknown as [string])[0]) === '/api/generaciones')).toBe(false)
  })

  it('con el estudio por defecto, la primera descripción elige "Usar solo mi descripción"', () => {
    render(<Tanda {...props()} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    expect(within(screen.getByRole('radiogroup', { name: 'Fondo' })).getByRole('radio', { name: /Usar solo mi descripción/ })).toBeChecked()
  })

  it('"Usar solo mi descripción" sin texto ni inspiración: no deja ver el precio y explica qué falta', () => {
    render(<Tanda {...props()} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Fondo' })).getByRole('radio', { name: /Usar solo mi descripción/ }))
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
    expect(screen.getByText(/tenés que escribir la descripción del fondo/)).toBeInTheDocument()
  })

  it('después de "Listo. Costo real" muestra con qué se generó', async () => {
    const usada = { fondo: 'fondo_estudio', descripcion: null, conInspiracion: false, posicionMoto: 'centro' }
    const f = vi.fn(async (u: string) => (String(u).endsWith('/confirmar') ? json({ generacion: { id: 'g1', estado: 'ok', costoRealUsd: 0.07, costoEstimadoUsd: 0.08, error: null }, creativos: [] }) : json(estimacion({ escena: usada }), 201)))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }))
    expect(await screen.findByText('Se generó con: Fondo: Fondo de estudio · Inspiración: no · Moto: centro')).toBeInTheDocument()
  })
})

describe('<Tanda> · lote de motos (ADR-032)', () => {
  const hm = (grupo: number, marca: number, o: Record<string, unknown> = {}) => hija(marca, { id: `m${grupo}-${marca}`, grupo, modelo: ['', 'TRK 502', 'Leoncino', 'Imperiale'][grupo]!, ...o })
  const grupoDe = (n: number, hijas: ReturnType<typeof hm>[], escenas: TandaVista['grupos'][number]['escenas'] = []) => ({
    grupo: n,
    modelo: ['', 'TRK 502', 'Leoncino', 'Imperiale'][n]!,
    hijaIds: hijas.map((h) => h.promocion.id),
    foto: null,
    comparten: { ok: true } as const,
    escenas,
  })
  const motos = () => {
    const a = [hm(1, 3), hm(1, 5)]
    const b = [hm(2, 3), hm(2, 5)]
    return { hijas: [...a, ...b], a, b }
  }
  const tandaMotos = (o: Partial<TandaVista> = {}) => {
    const { hijas, a, b } = motos()
    return tandaDe(hijas, { tipo: 'motos', grupos: [grupoDe(1, a), grupoDe(2, b)], ...o })
  }

  it('el resumen dice cuántas motos y cuántas marcas', () => {
    render(<Tanda {...props({ tanda: tandaMotos() })} />)
    expect(screen.getByText('2 motos × 2 marcas · 0 de 4 aprobadas')).toBeInTheDocument()
  })

  it('las piezas se agrupan por moto, cada una con sus marcas', () => {
    render(<Tanda {...props({ tanda: tandaMotos() })} />)
    const piezas = screen.getByRole('region', { name: 'Piezas' })
    const primera = within(piezas).getByRole('group', { name: 'Moto 1 · TRK 502' })
    const segunda = within(piezas).getByRole('group', { name: 'Moto 2 · Leoncino' })
    expect(within(primera).getAllByRole('listitem')).toHaveLength(2)
    expect(within(segunda).getAllByRole('listitem')).toHaveLength(2)
    expect(within(primera).getAllByRole('link', { name: 'Abrir' })[0]).toHaveAttribute('href', '/promocionar/m1-3?paso=2')
  })

  it('en vez de la imagen compartida muestra una imagen por moto, con la compuerta de lote', () => {
    render(<Tanda {...props({ tanda: tandaMotos() })} />)
    expect(screen.getByRole('heading', { name: 'Imágenes: una por moto' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Imagen compartida' })).toBeNull()
    expect(screen.getByRole('button', { name: /Ver precio de las 2 motos/ })).toBeInTheDocument()
  })

  it('Ver precio estima por el endpoint del lote, no por el de la tanda de marcas, y no gasta nada', async () => {
    const f = vi.fn(async (u: string) =>
      String(u) === '/api/generaciones/lote'
        ? json({ lote: { id: 'L1', costoEstimadoUsd: 0.09, items: [{ generacionId: 'g1', grupo: 1, modelo: 'TRK 502', costoEstimadoUsd: 0.045 }, { generacionId: 'g2', grupo: 2, modelo: 'Leoncino', costoEstimadoUsd: 0.045 }], venceEn: 'x' }, mes: { gastadoUsd: 0, topeUsd: 10 }, excedeTope: false }, 201)
        : json({ promocion: {} }),
    )
    vi.stubGlobal('fetch', f)
    const t = tandaMotos()
    // Ya tienen diseño y fondo (el mundo de hija() los trae): no hay nada que aplicar antes.
    render(<Tanda {...props({ tanda: t })} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver precio de las 2 motos/ }))
    expect(await screen.findByRole('button', { name: /Confirmar US\$ 0,0900 · 2 imágenes \(2 motos × 1\)/ })).toBeInTheDocument()
    expect((f.mock.calls as unknown as [string][]).map(([u]) => u)).toEqual(['/api/generaciones/lote'])
  })

  it('"Usar esta imagen" de una moto cambia SOLO las placas de esa moto, cada una con su revisión', async () => {
    const { hijas, a, b } = motos()
    const escenas = [{ generacion: { id: 'g1', estado: 'ok', motor: 'm', cantidad: 1, costoEstimadoUsd: 0.045, costoRealUsd: 0.04, error: null, creadoEn: 'x', interrumpida: false }, creativos: [{ id: 'cA', generacionId: 'g1', orden: 1, url: 'https://x/a.jpg', ancho: 1, alto: 1, costoUsd: 0.04, error: null, elegida: false, usadaEn: 0 }] }]
    const t = tandaDe(hijas, { tipo: 'motos', grupos: [grupoDe(1, a, escenas), grupoDe(2, b)], escenas })
    const f = vi.fn(async (u: string) => json({ promocion: vistaDePromocion(filaPromocion({ id: String(u).split('/')[3], revision: 2, grupo: 1 })), avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: t })} />)
    fireEvent.click(screen.getByRole('button', { name: /Usar esta imagen en las 2 placas de TRK 502/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
    const llamadas = (f.mock.calls as unknown as [string, RequestInit][]).map(([u, i]) => [u, JSON.parse(String(i.body))])
    expect(llamadas.map(([u]) => u).sort()).toEqual(['/api/promociones/m1-3', '/api/promociones/m1-5'])
    for (const [, cuerpo] of llamadas) expect(cuerpo).toEqual({ revision: 1, escenaCreativoId: 'cA' })
  })

  it('muestra lo pago sin generar y deja generarlo sin costo nuevo', () => {
    const t = tandaMotos({ pendientes: [{ generacionId: 'g1', loteId: 'L1', grupo: 1, modelo: 'TRK 502', estado: 'confirmada', interrumpida: false, costoEstimadoUsd: 0.045 }] })
    render(<Tanda {...props({ tanda: t })} />)
    expect(screen.getByText(/1 imagen paga sin generar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generar \(sin costo nuevo\)/ })).toBeInTheDocument()
  })

  it('con la imagen apagada, Ver precio del lote no hace nada', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaMotos(), apagado: 'Generar imágenes está apagado: falta la clave de Gemini.' })} />)
    const b = screen.getByRole('button', { name: /Ver precio de las 2 motos/ })
    expect(b).toBeDisabled()
    fireEvent.click(b)
    expect(f).not.toHaveBeenCalled()
  })

  it('si en una moto las marcas piden escenas distintas, no deja ver el precio y dice qué difiere', () => {
    const t = tandaMotos({ comparten: { ok: false, difieren: ['fondo'] } })
    render(<Tanda {...props({ tanda: t })} />)
    expect(screen.getByText(/Difiere: fondo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver precio de las 2 motos/ })).toBeDisabled()
  })
})

describe('<Tanda> · lote de textos (ADR-032)', () => {
  const ht = (variante: number, o: Record<string, unknown> = {}) => hija(3, { id: `t${variante}`, variante, titular: `Titular ${variante}`, ...o })
  const tandaTextos = (o: Partial<TandaVista> = {}) => tandaDe([ht(1), ht(2), ht(3)], { tipo: 'textos', ...o })

  it('el resumen dice cuántos textos', () => {
    render(<Tanda {...props({ tanda: tandaTextos() })} />)
    expect(screen.getByText('TRK 502 · 3 textos · 0 de 3 aprobadas')).toBeInTheDocument()
  })

  it('usa la imagen compartida de siempre (una escena para todos los textos), sin la compuerta de lote', () => {
    render(<Tanda {...props({ tanda: tandaTextos() })} />)
    expect(screen.getByRole('heading', { name: 'Imagen compartida' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Imágenes: una por moto' })).toBeNull()
  })

  it('cada pieza es un "Texto N" con su titular y su línea extra editables', () => {
    render(<Tanda {...props({ tanda: tandaTextos() })} />)
    const piezas = screen.getByRole('region', { name: 'Piezas' })
    expect(within(piezas).getByText('Texto 2')).toBeInTheDocument()
    expect(within(piezas).getAllByLabelText('Titular')).toHaveLength(3)
    expect(within(piezas).getAllByLabelText('Línea extra')).toHaveLength(3)
    expect(within(piezas).queryByText(MARCAS[3]!.nombre)).toBeNull()
  })

  it('editar el titular de un texto lo guarda solo, con la revisión de esa pieza', async () => {
    const f = vi.fn(async (u: string) => json({ promocion: vistaDePromocion(filaPromocion({ id: String(u).split('/')[3], revision: 2, titular: 'Nuevo titular', variante: 2 } as never)), avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<Tanda {...props({ tanda: tandaTextos(), esperaGuardadoMs: 10 })} />)
    const campos = within(screen.getByRole('region', { name: 'Piezas' })).getAllByLabelText('Titular')
    fireEvent.change(campos[1]!, { target: { value: 'Nuevo titular' } })
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!
    expect(url).toBe('/api/promociones/t2')
    expect(JSON.parse(String(init.body))).toEqual({ revision: 1, titular: 'Nuevo titular' })
  })

  it('un lector ve los textos pero no los puede editar', () => {
    render(<Tanda {...props({ tanda: tandaTextos(), puedeEditar: false })} />)
    expect(within(screen.getByRole('region', { name: 'Piezas' })).queryByLabelText('Titular')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Piezas' })).getByText('Titular 1')).toBeInTheDocument()
  })
})
