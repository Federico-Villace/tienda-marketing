import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { menuConPrecios } from '@/lib/productor/ediciones'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import { CrearImagen } from './crear-imagen'
import { piezaImagenDePrueba } from './fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const motores = [
  { id: 'gemini-nano-banana-2.1', nombre: 'Nano Banana 2.1', porImagenUsd: 0.0336 },
  { id: 'gemini-3-pro-image', nombre: 'Gemini 3 Pro Image', porImagenUsd: 0.134 },
]
const menuPorMotor = {
  'gemini-nano-banana-2.1': menuConPrecios('gemini-nano-banana-2.1', 1),
  'gemini-3-pro-image': menuConPrecios('gemini-3-pro-image', 1),
}
const fotoVista = (id: string) => ({
  id, ancho: 1536, alto: 2048, creadoEn: '2026-10-27T09:00:00Z', url: `https://x/${id}.jpg?token=T`, generaciones: [], creativos: [],
})
const props = {
  piezas: [piezaImagenDePrueba({ id: 'p1' }), piezaImagenDePrueba({ id: 'p2', raizId: 'r2' })],
  fotos: [fotoVista('f1'), fotoVista('f2')],
  piezaInicialId: null,
  puedeEditar: true,
  apagado: null,
  topeUsd: 10,
  gastadoUsd: 1.25,
  motores,
  motorPorDefecto: 'gemini-nano-banana-2.1',
  menuPorMotor,
}

const estimacion = (o: Record<string, unknown> = {}) => ({
  generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.0336, listaUsd: 0.0672, costoEstimadoUsd: 0.09006, venceEn: '2026-10-27T15:15:00Z' },
  mes: { gastadoUsd: 1.25, topeUsd: 10 },
  excedeTope: false,
  ...o,
})

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

const verPrecio = () => fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
async function estimar() {
  verPrecio()
  return screen.findByRole('button', { name: /Confirmar US\$/ })
}
const elegirOrigen = (nombre: RegExp) => fireEvent.click(screen.getByRole('radio', { name: nombre }))

describe('CrearImagen: encabezado de gasto', () => {
  it('muestra el gasto del mes contra el tope y avisa que nada se cobra hasta Confirmar', () => {
    render(<CrearImagen {...props} />)
    expect(screen.getByText(/US\$ 1,2500 de US\$ 10,0000 este mes/)).toBeInTheDocument()
    expect(screen.getByText(/Cada imagen cuesta plata real\. Nada se cobra hasta que apretás Confirmar\./)).toBeInTheDocument()
  })

  it('la barra de gasto es un meter accesible', () => {
    render(<CrearImagen {...props} />)
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1.25')
  })
})

describe('CrearImagen: paso 1, ¿de dónde partís?', () => {
  it('ofrece dos opciones como radios, la foto real por defecto y recomendada, cada una con su leyenda', () => {
    render(<CrearImagen {...props} />)
    const foto = screen.getByRole('radio', { name: /Una foto real de tu moto/ })
    expect(foto).toBeChecked()
    expect(screen.getByText('Recomendado')).toBeInTheDocument()
    expect(screen.getByText(/cambia el fondo o el formato y no toca la moto/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Un texto ya aprobado/ })).not.toBeChecked()
    expect(screen.getByText(/inventa la imagen desde cero\. Puede dibujar la moto distinta/)).toBeInTheDocument()
  })

  it('con foto: muestra las miniaturas como radios y la primera viene elegida', () => {
    render(<CrearImagen {...props} />)
    const fotos = screen.getAllByRole('radio', { name: /^Foto del/ })
    expect(fotos).toHaveLength(2)
    expect(fotos[0]).toBeChecked()
    expect(screen.queryByLabelText('Pieza aprobada')).toBeNull()
  })

  it('con texto: muestra el select de piezas aprobadas y oculta las fotos', () => {
    render(<CrearImagen {...props} />)
    elegirOrigen(/Un texto ya aprobado/)
    expect(screen.getByLabelText('Pieza aprobada').querySelectorAll('option')).toHaveLength(2)
    expect(screen.queryAllByRole('radio', { name: /^Foto del/ })).toHaveLength(0)
  })

  it('arranca en texto y en la pieza pedida si viene ?pieza=', () => {
    render(<CrearImagen {...props} piezaInicialId="p2" />)
    expect(screen.getByRole('radio', { name: /Un texto ya aprobado/ })).toBeChecked()
    expect(screen.getByLabelText('Pieza aprobada')).toHaveValue('p2')
  })

  it('texto sin piezas aprobadas explica cómo conseguirlas y linkea a Contenido', () => {
    render(<CrearImagen {...props} piezas={[]} />)
    elegirOrigen(/Un texto ya aprobado/)
    expect(screen.getByText(/Todavía no hay piezas aprobadas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Contenido/ })).toHaveAttribute('href', '/contenido')
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
  })

  it('sin fotos invita a subir la primera y deja el formulario de subida a la vista', () => {
    render(<CrearImagen {...props} fotos={[]} />)
    expect(screen.getByText(/Todavía no subiste ninguna foto/)).toBeInTheDocument()
    expect(screen.getByText(/Subir es gratis/)).toBeInTheDocument()
    expect(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto)).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
  })

  it('subir exige tildar los derechos (el botón sigue deshabilitado con foto elegida pero sin tildar)', () => {
    render(<CrearImagen {...props} fotos={[]} />)
    fireEvent.change(screen.getByLabelText(/Elegir una foto/), { target: { files: [new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })] } })
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    expect(screen.getByRole('button', { name: 'Subir' })).toBeEnabled()
  })
})

describe('CrearImagen: borrar foto', () => {
  it('pide confirmación, llama al DELETE de la foto elegida y refresca', async () => {
    const f = vi.fn(async () => json({ ok: true, pendiente: false }))
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar esta foto' }))
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/fotos/f1')
  })

  it('Cancelar no borra nada', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar esta foto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(f).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Borrar esta foto' })).toBeInTheDocument()
  })

  it('si el archivo quedó pendiente de borrar lo avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, pendiente: true })))
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar esta foto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/pendiente/i)
  })

  it('un error al borrar se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No se pudo borrar la foto.' }, 500)))
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar esta foto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo borrar')
  })
})

describe('CrearImagen: paso 2, ¿qué querés?', () => {
  it('foto: lista las cinco ediciones con nombre, descripción y precio, la primera elegida', () => {
    render(<CrearImagen {...props} />)
    const grupo = screen.getByRole('radiogroup', { name: /¿Qué querés hacer con la foto\?/ })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(5)
    expect(within(grupo).getByRole('radio', { name: /Fondo de estudio/ })).toBeChecked()
    expect(screen.getByText(/Fondo liso gris claro con sombra suave/)).toBeInTheDocument()
    expect(screen.getAllByText(/hasta US\$ 0,04503 por imagen/)).toHaveLength(5)
  })

  it('foto: el formato tiene etiquetas humanas', () => {
    render(<CrearImagen {...props} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Formato' })
    expect(within(grupo).getByRole('radio', { name: /Cuadrado 1:1 · feed/ })).toBeInTheDocument()
    expect(within(grupo).getByRole('radio', { name: /Vertical 4:5 · feed/ })).toBeChecked()
    expect(within(grupo).getByRole('radio', { name: /Historia 9:16/ })).toBeInTheDocument()
  })

  it('el motor se explica en lenguaje humano y el barato es el de por defecto', () => {
    render(<CrearImagen {...props} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Motor' })
    expect(within(grupo).getByRole('radio', { name: /Nano Banana 2\.1 · rápido y barato/ })).toBeChecked()
    expect(within(grupo).getByRole('radio', { name: /Gemini 3 Pro Image · más fiel, ~4× el precio/ })).not.toBeChecked()
  })

  it('cambiar de motor cambia el precio por imagen de las ediciones', () => {
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: /Gemini 3 Pro Image/ }))
    expect(screen.getAllByText(/hasta US\$ 0,18612 por imagen/)).toHaveLength(5)
  })

  it('cantidad de variantes de 1 a 4', () => {
    render(<CrearImagen {...props} />)
    expect(Array.from(screen.getByLabelText('Variantes').querySelectorAll('option')).map((o) => o.textContent)).toEqual(['1', '2', '3', '4'])
  })

  it('texto: muestra proporción y brief visual de la pieza, sin edición ni formato', () => {
    render(<CrearImagen {...props} />)
    elegirOrigen(/Un texto ya aprobado/)
    expect(screen.getByText(/Proporción 4:5/)).toBeInTheDocument()
    expect(screen.getByText(/Brief visual:/)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Formato' })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Fondo de estudio/ })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Motor' })).toBeInTheDocument()
  })

  it('aclara que el video todavía no está', () => {
    render(<CrearImagen {...props} />)
    expect(screen.getByText(/El video todavía no está disponible/)).toBeInTheDocument()
  })
})

describe('CrearImagen: paso 3, precio y confirmación (regla #3)', () => {
  it('antes de ver el precio no existe Confirmar y no se llama a ninguna API', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.getByText(/Ver precio no cuesta nada/)).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('foto: Ver precio manda fotoId, edición, formato, motor y cantidad, sin precio, y NO confirma solo', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: /Escenario urbano/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Historia 9:16/ }))
    fireEvent.change(screen.getByLabelText('Variantes'), { target: { value: '2' } })
    fireEvent.click(screen.getAllByRole('radio', { name: /^Foto del/ })[1]!)
    const confirmar = await estimar()
    expect(confirmar).toHaveTextContent('Confirmar US$ 0,09006')
    expect(screen.getByText(/Recién acá se cobra\. La estimación vence en 15 minutos\./)).toBeInTheDocument()
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ fotoId: 'f2', edicion: 'escenario_urbano', aspecto: '9:16', motor: 'gemini-nano-banana-2.1', cantidad: 2 })
  })

  it('texto: Ver precio manda solo pieza, motor y cantidad', async () => {
    const f = vi.fn(async () => json(estimacion(), 201))
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    elegirOrigen(/Un texto ya aprobado/)
    fireEvent.change(screen.getByLabelText('Variantes'), { target: { value: '3' } })
    await estimar()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generaciones')
    expect(JSON.parse(String(init.body))).toEqual({ piezaId: 'p1', motor: 'gemini-nano-banana-2.1', cantidad: 3 })
  })

  it('muestra la estimación del servidor con el precio de lista', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion(), 201)))
    render(<CrearImagen {...props} />)
    await estimar()
    expect(screen.getByText(/precio de lista US\$ 0,0672/)).toBeInTheDocument()
  })

  it('confirmar llama al endpoint de la generación, muestra el costo real y refresca', async () => {
    const f = vi.fn(async (u: string) =>
      u === '/api/generaciones' ? json(estimacion(), 201) : json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.0708, costoEstimadoUsd: 0.09006, error: null }, creativos: [] }),
    )
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByText(/Costo real: US\$ 0,0708/)).toBeInTheDocument()
    expect(f.mock.calls[1]![0]).toBe('/api/generaciones/g9/confirmar')
    expect(router.refresh).toHaveBeenCalled()
  })

  it('doble click en Confirmar: una sola request y el botón queda deshabilitado mientras corre', async () => {
    let terminar!: (r: Response) => void
    const f = vi.fn((u: string) => (u === '/api/generaciones' ? Promise.resolve(json(estimacion(), 201)) : new Promise<Response>((r) => (terminar = r))))
    vi.stubGlobal('fetch', f)
    render(<CrearImagen {...props} />)
    const boton = await estimar()
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByRole('button', { name: /Generando/ })).toBeDisabled())
    expect(f.mock.calls.filter((x) => String(x[0]).includes('confirmar'))).toHaveLength(1)
    terminar(json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.07, costoEstimadoUsd: 0.09, error: null }, creativos: [] }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })

  it('si la estimación excede el tope, Confirmar queda deshabilitado y lo explica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion({ excedeTope: true }), 201)))
    render(<CrearImagen {...props} />)
    expect(await estimar()).toBeDisabled()
    expect(screen.getByText(/supera lo que queda del tope mensual/i)).toBeInTheDocument()
  })

  it.each([
    [402, { error: 'Supera el tope mensual.', restanteUsd: 0.05, topeUsd: 10 }, /Supera el tope del mes: quedan US\$ 0,0500 de US\$ 10,0000/],
    [409, { error: 'Ya se confirmó: no se vuelve a cobrar.' }, /Esta imagen ya se confirmó: no se cobra dos veces/],
    [410, { error: 'La estimación venció: estimá de nuevo.' }, /La estimación venció.*Ver precio/],
  ])('error %s al confirmar: mensaje humano', async (status, cuerpo, patron) => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/generaciones' ? json(estimacion(), 201) : json(cuerpo, status))))
    render(<CrearImagen {...props} />)
    fireEvent.click(await estimar())
    expect(await screen.findByRole('alert')).toHaveTextContent(patron)
    if (status === 402) expect(screen.getByRole('button', { name: /Confirmar US\$/ })).toBeDisabled()
    else expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).toBeNull()
    if (status === 410) expect(router.refresh).not.toHaveBeenCalled()
    else if (status === 409) await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it('un error al estimar se muestra y no deja ninguna estimación', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'La foto se borró.' }, 410)))
    render(<CrearImagen {...props} />)
    verPrecio()
    expect(await screen.findByRole('alert')).toHaveTextContent('La foto se borró.')
    expect(screen.queryByRole('button', { name: /Confirmar US\$/ })).toBeNull()
  })

  it.each([
    ['la edición', () => fireEvent.click(screen.getByRole('radio', { name: /Ruta abierta/ }))],
    ['el formato', () => fireEvent.click(screen.getByRole('radio', { name: /Historia 9:16/ }))],
    ['el motor', () => fireEvent.click(screen.getByRole('radio', { name: /Gemini 3 Pro Image/ }))],
    ['las variantes', () => fireEvent.change(screen.getByLabelText('Variantes'), { target: { value: '4' } })],
    ['la foto', () => fireEvent.click(screen.getAllByRole('radio', { name: /^Foto del/ })[1]!)],
    ['el origen', () => elegirOrigen(/Un texto ya aprobado/)],
  ])('cambiar %s descarta la estimación', async (_n, cambiar) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(estimacion(), 201)))
    render(<CrearImagen {...props} />)
    await estimar()
    cambiar()
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })
})

describe('CrearImagen: apagado y lector', () => {
  it('apagado: explica el motivo en lenguaje humano y no deja ver precio', () => {
    render(<CrearImagen {...props} apagado="Generar imágenes está apagado: falta la clave de Gemini." />)
    expect(screen.getByRole('status')).toHaveTextContent('falta la clave de Gemini')
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
  })

  it('el lector ve el gasto y una línea que explica por qué no hay controles', () => {
    render(<CrearImagen {...props} puedeEditar={false} />)
    expect(screen.getByText(/US\$ 1,2500 de US\$ 10,0000 este mes/)).toBeInTheDocument()
    expect(screen.getByText(/Tu rol solo permite ver/)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Variantes')).toBeNull()
  })

  it('sin tope muestra el gasto sin barra', () => {
    render(<CrearImagen {...props} topeUsd={null} apagado="Generar imágenes está apagado: falta definir el tope de gasto mensual." />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByText(/Gastado este mes: US\$ 1,2500/)).toBeInTheDocument()
  })
})
