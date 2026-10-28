import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoDatos } from './paso-datos'
import { MARCAS } from '@/lib/datos/marcas'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { filaPromocion } from '@/lib/promocion/fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const fotos = [
  { id: 'f1', ancho: 1200, alto: 1500, creadoEn: '2026-10-25T10:00:00+00:00', url: 'https://x/f1.jpg' },
  { id: 'f2', ancho: 1200, alto: 1500, creadoEn: '2026-10-24T10:00:00+00:00', url: 'https://x/f2.jpg' },
]

beforeEach(() => {
  router.push.mockClear()
  router.refresh.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

function completar() {
  fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
  fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TRK 502' } })
  fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '4500000' } })
  fireEvent.click(screen.getByRole('radio', { name: /Cuotas/ }))
  fireEvent.change(screen.getByLabelText(/Detalle de la promoción/), { target: { value: '12 cuotas sin interés' } })
  fireEvent.click(screen.getAllByRole('radio', { name: /Foto subida/ })[0]!)
}

describe('<PasoDatos> · el formulario', () => {
  it('las indicaciones son para el texto: el fondo y la foto de inspiración se piden en el paso 4', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    expect(screen.getByLabelText('Indicaciones para el texto (opcional)')).toBeInTheDocument()
    expect(screen.getByText(/El fondo y la foto de inspiración se piden en el paso 4/)).toBeInTheDocument()
  })

  it('tiene grupos con leyenda: marca, promoción, foto y formato', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    for (const l of ['Promoción', 'Foto', 'Formato']) expect(screen.getByRole('radiogroup', { name: l })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: /Marcas/ })).getAllByRole('checkbox')).toHaveLength(8) // 7 + Todas
  })

  it('las marcas se leen por su nombre, no por un id', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    for (const m of MARCAS) expect(screen.getByRole('checkbox', { name: m.nombre })).toBeInTheDocument()
  })

  it('muestra cómo se va a ver el precio con puntos de miles', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '4500000' } })
    expect(screen.getByText('Se va a ver así: $ 4.500.000')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } })
    expect(screen.getByText('Se va a ver así: US$ 4.500.000')).toBeInTheDocument()
  })

  it('el precio acepta solo números: con letras o puntos avisa y no deja seguir', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    completar()
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '4.500.000' } })
    expect(screen.getByText(/Escribí solo números/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Seguir/ })).toBeDisabled()
  })

  it('el lugar viene con Quilmes y el formato con 4:5', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    expect(screen.getByLabelText('Lugar')).toHaveValue('Quilmes')
    expect(screen.getByRole('radio', { name: /4:5/ })).toBeChecked()
  })

  it('no se puede seguir hasta tener marca, modelo, precio y foto', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    const seguir = screen.getByRole('button', { name: /Seguir/ })
    expect(seguir).toBeDisabled()
    completar()
    expect(seguir).toBeEnabled()
  })

  it('cada foto se elige por radio y tiene su imagen', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    expect(screen.getAllByRole('radio', { name: /Foto subida/ })).toHaveLength(2)
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2)
  })

  it('sin fotos lo dice y ofrece subir una', () => {
    render(<PasoDatos fotos={[]} puedeEditar />)
    expect(screen.getByText(/Todavía no subiste ninguna foto/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Elegir una foto/)).toBeInTheDocument()
  })
})

describe('<PasoDatos> · crear', () => {
  it('manda el pedido exacto (el monto como número) y sigue al paso 2', async () => {
    const f = vi.fn(async () => json({ promocion: { id: 'p-nueva', pasoActual: 2 } }, 201))
    vi.stubGlobal('fetch', f)
    render(<PasoDatos fotos={fotos} puedeEditar />)
    completar()
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/p-nueva?paso=2'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones')
    expect(JSON.parse(String(init.body))).toEqual({
      marcaId: MARCAS[3]!.id,
      modelo: 'TRK 502',
      precio: { moneda: 'ARS', monto: 4500000 },
      promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
      lugar: 'Quilmes',
      indicaciones: '',
      fotoId: 'f1',
      aspecto: '4:5',
    })
  })

  it('un doble click manda un solo pedido', async () => {
    const f = vi.fn(async () => json({ promocion: { id: 'p1', pasoActual: 2 } }, 201))
    vi.stubGlobal('fetch', f)
    render(<PasoDatos fotos={fotos} puedeEditar />)
    completar()
    const seguir = screen.getByRole('button', { name: /Seguir/ })
    fireEvent.click(seguir)
    fireEvent.click(seguir)
    await waitFor(() => expect(router.push).toHaveBeenCalled())
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('los errores del servidor se muestran en castellano, uno por línea', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Revisá los datos de la promoción.', errores: ['Elegí una de las marcas.', 'Falta la foto.'] }, 400)))
    render(<PasoDatos fotos={fotos} puedeEditar />)
    completar()
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Elegí una de las marcas.')
    expect(alerta).toHaveTextContent('Falta la foto.')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('una foto borrada (410) se lo dice y deja elegir otra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró: subí otra.' }, 410)))
    render(<PasoDatos fotos={fotos} puedeEditar />)
    completar()
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La foto se borró: subí otra.')
    expect(screen.getByRole('button', { name: /Seguir/ })).toBeEnabled()
  })
})

describe('<PasoDatos> · varias marcas (tanda)', () => {
  const dosMarcas = () => {
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[5]!.nombre }))
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TRK 502' } })
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '4500000' } })
    fireEvent.click(screen.getAllByRole('radio', { name: /Foto subida/ })[0]!)
  }

  it('con 2 o más marcas avisa cuántas piezas se arman', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    expect(screen.queryByText(/Se van a armar/)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[5]!.nombre }))
    expect(screen.getByText('Se van a armar 2 piezas: una por marca')).toBeInTheDocument()
  })

  it('manda UNA tanda a /api/tandas con las marcas y lleva a la pantalla de la tanda', async () => {
    const f = vi.fn(async () => json({ tanda: { id: 't9' }, promociones: [] }, 201))
    vi.stubGlobal('fetch', f)
    render(<PasoDatos fotos={fotos} puedeEditar />)
    dosMarcas()
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/tanda/t9'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/tandas')
    expect(JSON.parse(String(init.body)).marcaIds).toEqual([MARCAS[3]!.id, MARCAS[5]!.id])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('un error de la tanda (409) se muestra y no navega', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Alguna de esas marcas ya está en la tanda.' }, 409)))
    render(<PasoDatos fotos={fotos} puedeEditar />)
    dosMarcas()
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ya está en la tanda')
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('<PasoDatos> · editar una promoción', () => {
  const promo = vistaDePromocion(filaPromocion({ id: 'p9', revision: 3, foto_id: 'f2', marca_id: MARCAS[3]!.id, aspecto: '9:16' }))

  it('viene con lo que ya se cargó', () => {
    render(<PasoDatos fotos={fotos} puedeEditar promocion={promo} />)
    expect(screen.getByRole('radio', { name: MARCAS[3]!.nombre })).toBeChecked()
    expect(screen.getByLabelText('Modelo')).toHaveValue('TRK 502')
    expect(screen.getByLabelText('Precio')).toHaveValue('4500000')
    expect(screen.getByRole('radio', { name: /9:16/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Cuotas/ })).toBeChecked()
  })

  it('guarda con PATCH y la revisión que veía, y vuelve al paso en el que estaba', async () => {
    const f = vi.fn(async () => json({ promocion: { id: 'p9', pasoActual: 2 }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoDatos fotos={fotos} puedeEditar promocion={promo} />)
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TRK 502 X' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/p9?paso=2'))
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/promociones/p9')
    expect(init.method).toBe('PATCH')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo).toMatchObject({ revision: 3, modelo: 'TRK 502 X', fotoId: 'f2', aspecto: '9:16', marcaId: MARCAS[3]!.id })
    expect(cuerpo.datos.precio).toEqual({ moneda: 'ARS', monto: 4500000 })
  })

  it('si el cambio descartó la imagen ya generada, lo avisa antes de seguir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ promocion: { id: 'p9', pasoActual: 4 }, avisos: ['Cambiaste el formato: la imagen que habías generado se descartó porque tiene otra proporción.'] })))
    render(<PasoDatos fotos={fotos} puedeEditar promocion={promo} />)
    fireEvent.click(screen.getByRole('radio', { name: /1:1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('se descartó porque tiene otra proporción')
    expect(router.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Entendido, seguir/ }))
    expect(router.push).toHaveBeenCalledWith('/promocionar/p9?paso=4')
  })

  it('un 409 dice que otra persona cambió la promoción y ofrece recargar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409)))
    render(<PasoDatos fotos={fotos} puedeEditar promocion={promo} />)
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('recargá la pantalla')
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(router.refresh).toHaveBeenCalled()
  })

  it('una promoción aprobada no se edita desde acá', () => {
    render(<PasoDatos fotos={fotos} puedeEditar promocion={{ ...promo, estado: 'aprobada' }} />)
    expect(screen.getByText(/Está aprobada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull()
  })
})

describe('<PasoDatos> · lector', () => {
  it('solo mira: sin botón y todo deshabilitado', () => {
    render(<PasoDatos fotos={fotos} puedeEditar={false} />)
    // El aviso único lo pone la pantalla (app/promocionar/nueva y [id]), no el paso.
    expect(screen.queryByText(/solo permite ver/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull()
    expect(screen.getByLabelText('Modelo')).toBeDisabled()
  })
})

describe('<PasoDatos> · idea precargada del Analista', () => {
  const inicial = { origen: 'analista', marcaIds: [MARCAS[3]!.id], modelo: 'TRK 502', tipo: 'cuotas', aspecto: '9:16', indicaciones: 'Viernes. Cuotas en reel' } as const

  it('con `inicial` arranca con marca, modelo, promo, formato e indicaciones, y avisa que hay que revisar', () => {
    render(<PasoDatos fotos={fotos} puedeEditar inicial={inicial} />)
    expect(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre })).toBeChecked()
    expect(screen.getByLabelText('Modelo')).toHaveValue('TRK 502')
    expect(screen.getByRole('radio', { name: /Cuotas/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /9:16/ })).toBeChecked()
    expect(screen.getByLabelText('Indicaciones para el texto (opcional)')).toHaveValue('Viernes. Cuotas en reel')
    expect(screen.getByRole('note')).toHaveTextContent(/Precargado con una idea del Analista/)
  })

  it('precargar no crea nada: no hay llamadas hasta que la persona sigue', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoDatos fotos={fotos} puedeEditar inicial={inicial} />)
    expect(f).not.toHaveBeenCalled()
  })

  it('sin `inicial` el formulario es el de siempre, sin aviso', () => {
    render(<PasoDatos fotos={fotos} puedeEditar />)
    expect(screen.getByLabelText('Modelo')).toHaveValue('')
    expect(screen.getByRole('radio', { name: /4:5/ })).toBeChecked()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
