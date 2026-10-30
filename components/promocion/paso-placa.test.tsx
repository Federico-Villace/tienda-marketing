import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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
  inspiracion: null as { id: string; url: string | null; borrada: boolean } | null,
}
const conDiseno = { ...base, plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }
const estimacion = (o: Record<string, unknown> = {}) => ({ generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.0672, costoEstimadoUsd: 0.09, venceEn: '2026-10-25T13:00:00Z', origen: 'promocion' }, mes: { gastadoUsd: 1, topeUsd: 10 }, excedeTope: false, ...o })

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const cuerpoDe = (f: { mock: { calls: unknown[][] } }, i = 0) => JSON.parse(String((f.mock.calls[i] as unknown as [string, RequestInit])[1].body))

describe('<PasoPlaca> · diseño: estilo, dónde va el texto y dónde va la moto', () => {
  it('son tres controles de una línea cada uno, sin repetirse: estilo (2), texto (3) y moto (3)', () => {
    render(<PasoPlaca {...props} />)
    expect(within(screen.getByRole('radiogroup', { name: 'Estilo' })).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Degradado/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Panel liso/ })).toBeInTheDocument()
    const texto = screen.getByRole('radiogroup', { name: 'Dónde va el texto' })
    expect(within(texto).getAllByRole('radio')).toHaveLength(3)
    for (const n of ['Arriba', 'Abajo', 'Al costado']) expect(within(texto).getByRole('radio', { name: new RegExp(n) })).toBeInTheDocument()
    const moto = screen.getByRole('radiogroup', { name: 'Dónde va la moto' })
    for (const n of ['Izquierda', 'Centro', 'Derecha']) expect(within(moto).getByRole('radio', { name: new RegExp(n) })).toBeInTheDocument()
  })

  it('refleja el diseño guardado', () => {
    render(<PasoPlaca {...props} promocion={{ ...base, plantilla: 'catalogo_arriba', fondo: 'fondo_estudio', posicionMoto: 'derecha' }} />)
    expect(screen.getByRole('radio', { name: /Panel liso/ })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Dónde va el texto' })).getByRole('radio', { name: /Arriba/ })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Dónde va la moto' })).getByRole('radio', { name: /Derecha/ })).toBeChecked()
  })

  it('elegir un estilo guarda el diseño (abajo por defecto) con el fondo sugerido y la revisión que veía', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, plantilla: 'catalogo', fondo: 'fondo_estudio' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: /Panel liso/ }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /Panel liso/ })).toBeChecked())
    expect(cuerpoDe(f)).toEqual({ revision: 5, plantilla: 'catalogo', fondo: 'fondo_estudio' })
  })

  it('elegir dónde va el texto conserva el estilo y respeta un fondo ya elegido', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, plantilla: 'catalogo_arriba', fondo: 'escenario_ruta' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...base, plantilla: 'catalogo', fondo: 'escenario_ruta' }} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Dónde va el texto' })).getByRole('radio', { name: /Arriba/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, plantilla: 'catalogo_arriba', fondo: 'escenario_ruta' })
  })

  it('al costado, si la moto estaba al centro, la pasa a la izquierda en el mismo guardado (no hay estado inválido)', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, plantilla: 'oferta_costado', fondo: 'fondo_estudio', posicionMoto: 'izquierda' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...base, plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Dónde va el texto' })).getByRole('radio', { name: /Al costado/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, plantilla: 'oferta_costado', fondo: 'fondo_estudio', posicionMoto: 'izquierda' })
  })

  it('con el texto al costado la moto no puede ir al centro (queda deshabilitado y lo explica)', () => {
    render(<PasoPlaca {...props} promocion={{ ...base, plantilla: 'oferta_costado', fondo: 'fondo_estudio', posicionMoto: 'derecha' }} />)
    expect(within(screen.getByRole('radiogroup', { name: 'Dónde va la moto' })).getByRole('radio', { name: /Centro/ })).toBeDisabled()
    expect(screen.getByText(/el texto va del lado opuesto/)).toBeInTheDocument()
  })

  it('elegir dónde va la moto la guarda sola', async () => {
    const f = vi.fn(async () => json({ promocion: { ...base, revision: 6, posicionMoto: 'derecha' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Dónde va la moto' })).getByRole('radio', { name: /Derecha/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, posicionMoto: 'derecha' })
  })

  it('el fondo se elige aparte, con nombre y descripción', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, fondo: 'escenario_urbano' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.click(screen.getByRole('radio', { name: /Escenario urbano/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, fondo: 'escenario_urbano' })
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

  it('el titular se guarda solo (al salir del campo); si trae un número el servidor lo rechaza y se ve', async () => {
    const f = vi.fn(async () => json({ error: 'Revisá lo que cambiaste.', errores: ['El titular no lleva precios ni números: el precio va aparte, en la imagen.'] }, 400))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    expect(screen.getByLabelText('Titular')).toHaveValue('Tu próxima aventura')
    expect(screen.queryByRole('button', { name: 'Guardar titular' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Desde 12 cuotas' } })
    fireEvent.blur(screen.getByLabelText('Titular'))
    expect(await screen.findByRole('alert')).toHaveTextContent('no lleva precios ni números')
    expect(cuerpoDe(f)).toEqual({ revision: 5, titular: 'Desde 12 cuotas' })
  })

  it('"Ver la versión final" guarda antes lo pendiente (la línea extra recién escrita) y recién ahí arma la placa', async () => {
    const f = vi.fn(async (u: string) => {
      if (u === '/api/promociones/p1') return json({ promocion: { ...elegida, revision: 6, lineaExtra: 'Hot Sale' }, avisos: [] })
      return json({ url: 'https://x/final.png', hash: 'h', reutilizada: false, promocion: { ...elegida, revision: 7, lineaExtra: 'Hot Sale', placaLista: true, pasoActual: 5 } })
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={60_000} promocion={elegida} escenas={[gen([escena({ esLaElegida: true })])]} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hot Sale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver la versión final' }))
    expect(await screen.findByAltText(/Imagen final/)).toBeInTheDocument()
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['/api/promociones/p1', '/api/promociones/p1/placa'])
    expect(cuerpoDe(f, 0)).toEqual({ revision: 5, lineaExtra: 'Hot Sale' })
    expect(cuerpoDe(f, 1)).toEqual({ revision: 6 })
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


describe('<PasoPlaca> · descripción del fondo (se guarda sola)', () => {
  it('es un textarea opcional de hasta 300 caracteres, con un ejemplo y un contador; no hay botón "Guardar"', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    const c = screen.getByLabelText('Descripción del fondo (opcional)')
    expect(c.tagName).toBe('TEXTAREA')
    expect(c).toHaveAttribute('maxlength', '300')
    expect(c).toHaveAttribute('placeholder', expect.stringMatching(/^Ej\.: /))
    expect(screen.getByText(/^0\/300/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Guardar/ })).toBeNull()
  })

  it('muestra la guardada y el contador la cuenta', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, fondoDescripcion: 'Calle de noche' }} />)
    expect(screen.getByLabelText('Descripción del fondo (opcional)')).toHaveValue('Calle de noche')
    expect(screen.getByText(/^14\/300/)).toBeInTheDocument()
  })

  it('se guarda sola al dejar de escribir (con la revisión que veía y sin espacios de sobra) y dice "Guardado"', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, fondo: 'escenario_urbano', revision: 6, fondoDescripcion: 'Atardecer en la ruta' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={5} promocion={{ ...conDiseno, fondo: 'escenario_urbano' }} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: '  Atardecer en la ruta ' } })
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(cuerpoDe(f)).toEqual({ revision: 5, fondoDescripcion: 'Atardecer en la ruta' })
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
  })

  it('al salir del campo se guarda en el momento', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, fondo: 'escenario_urbano', revision: 6, fondoDescripcion: 'x' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={60_000} promocion={{ ...conDiseno, fondo: 'escenario_urbano' }} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'x' } })
    expect(screen.getByText('Sin guardar…')).toBeInTheDocument()
    fireEvent.blur(screen.getByLabelText('Descripción del fondo (opcional)'))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(cuerpoDe(f)).toEqual({ revision: 5, fondoDescripcion: 'x' })
  })

  it('vaciarla la borra', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, fondoDescripcion: null }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, fondoDescripcion: 'Algo' }} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Descripción del fondo (opcional)'))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, fondoDescripcion: null })
  })

  it('BUG H1: escribirla y tocar "Ver precio" sin guardar => primero se guarda y DESPUÉS se estima', async () => {
    const f = vi.fn(async (u: string) => {
      if (u === '/api/promociones/p1') return json({ promocion: { ...conDiseno, revision: 6, fondo: 'solo_descripcion', fondoDescripcion: 'foto de noche en puerto madero.' }, avisos: [] })
      return json(estimacion(), 201)
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={60_000} promocion={conDiseno} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'foto de noche en puerto madero.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    await screen.findByRole('button', { name: /Confirmar US\$/ })
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['/api/promociones/p1', '/api/generaciones'])
    expect(cuerpoDe(f, 0)).toEqual({ revision: 5, fondoDescripcion: 'foto de noche en puerto madero.', fondo: 'solo_descripcion' })
  })

  it('si no se puede guardar, NO se estima y se dice por qué', async () => {
    const f = vi.fn(async () => json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={60_000} promocion={conDiseno} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta promoción cambió')
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls.some((c) => (c as unknown as [string])[0] === '/api/generaciones')).toBe(false)
  })

  it('con el fondo por defecto (estudio), la primera descripción pasa el fondo a "Usar solo mi descripción" y lo avisa', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, fondo: 'solo_descripcion', fondoDescripcion: 'de noche' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    fireEvent.blur(screen.getByLabelText('Descripción del fondo (opcional)'))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, fondoDescripcion: 'de noche', fondo: 'solo_descripcion' })
    expect(await screen.findByRole('radio', { name: /Usar solo mi descripción/ })).toBeChecked()
    expect(screen.getByText(/el fondo pasó a "Usar solo mi descripción"/)).toBeInTheDocument()
  })

  it('dos guardados seguidos van en fila, cada uno con la revisión que devolvió el anterior (sin 409 propios)', async () => {
    let rev = 5
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      rev++
      const c = JSON.parse(String(init.body))
      return json({ promocion: { ...conDiseno, fondo: 'escenario_urbano', revision: rev, ...(c.fondoDescripcion !== undefined ? { fondoDescripcion: c.fondoDescripcion } : {}), ...(c.posicionMoto ? { posicionMoto: c.posicionMoto } : {}) }, avisos: [] })
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={60_000} promocion={{ ...conDiseno, fondo: 'escenario_urbano' }} />)
    fireEvent.change(screen.getByLabelText('Descripción del fondo (opcional)'), { target: { value: 'de noche' } })
    fireEvent.blur(screen.getByLabelText('Descripción del fondo (opcional)'))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Dónde va la moto' })).getByRole('radio', { name: /Izquierda/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
    expect(cuerpoDe(f, 0)).toEqual({ revision: 5, fondoDescripcion: 'de noche' })
    expect(cuerpoDe(f, 1)).toEqual({ revision: 6, posicionMoto: 'izquierda' })
  })

  it('con un fondo armado y descripción, aclara que manda la descripción', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, fondo: 'escenario_urbano', fondoDescripcion: 'de noche' }} />)
    expect(screen.getByText(/manda lo que escribiste/)).toBeInTheDocument()
  })

  it('"Usar solo mi descripción" sin descripción ni inspiración: no deja ver el precio y explica qué falta', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, fondo: 'solo_descripcion' }} />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeDisabled()
    expect(screen.getByText(/tenés que escribir la descripción del fondo/)).toBeInTheDocument()
  })

  it('aclara que las reglas de la moto no se pueden cambiar y que conviene generar otra imagen', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    expect(screen.getByText(/La moto no se modifica/)).toBeInTheDocument()
  })

  it('un lector la ve deshabilitada y nunca guarda', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} esperaGuardadoMs={5} promocion={{ ...conDiseno, fondoDescripcion: 'x' }} puedeEditar={false} />)
    expect(screen.getByLabelText('Descripción del fondo (opcional)')).toBeDisabled()
    await new Promise((r) => setTimeout(r, 30))
    expect(f).not.toHaveBeenCalled()
  })
})

describe('<PasoPlaca> · qué se va a pedir y con qué se generó', () => {
  it('antes de estimar dice con qué se va a pedir la imagen (lo preseleccionado queda a la vista)', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, posicionMoto: 'izquierda', inspiracionFotoId: 'i1' }} inspiracion={{ id: 'i1', url: 'https://x/i1.jpg', borrada: false }} />)
    expect(screen.getByText('Se va a pedir con: Fondo: Fondo de estudio · Inspiración: sí · Moto: izquierda')).toBeInTheDocument()
  })

  it('después de "Listo. Costo real" muestra con qué se generó (lo que devolvió el servidor)', async () => {
    const usada = { fondo: 'solo_descripcion', descripcion: 'foto de noche en puerto madero.', conInspiracion: true, posicionMoto: 'izquierda' }
    const f = vi.fn(async (u: string) => {
      if (u === '/api/generaciones') return json(estimacion({ generacion: { ...estimacion().generacion, conInspiracion: true, escena: usada } }), 201)
      return json({ generacion: { id: 'g9', estado: 'ok', costoRealUsd: 0.08, costoEstimadoUsd: 0.09, error: null }, creativos: [] })
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, fondo: 'solo_descripcion', fondoDescripcion: 'foto de noche en puerto madero.' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar US\$/ }))
    expect(await screen.findByText(/Costo real/)).toBeInTheDocument()
    expect(screen.getByText('Se generó con: Fondo: tu descripción («foto de noche en puerto madero.») · Inspiración: sí · Moto: izquierda')).toBeInTheDocument()
  })
})

describe('<PasoPlaca> · titular y línea extra con contador', () => {
  const elegida = { ...conDiseno, escenaCreativoId: ID_ESCENA }
  const conEscena = <T extends object>(p: T) => ({ ...props, ...p, escenas: [gen([escena({ esLaElegida: true })])] })

  it('el contador del titular y el de la línea extra siguen a dónde va el texto (40/60 arriba y abajo, 28/36 al costado)', () => {
    const { unmount } = render(<PasoPlaca {...conEscena({ promocion: elegida })} />)
    expect(screen.getByLabelText('Titular')).toHaveAttribute('maxlength', '40')
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveAttribute('maxlength', '60')
    expect(screen.getByText(/\/40 · Sin precios ni números/)).toBeInTheDocument()
    unmount()
    render(<PasoPlaca {...conEscena({ promocion: { ...elegida, plantilla: 'oferta_costado', posicionMoto: 'izquierda' } })} />)
    expect(screen.getByLabelText('Titular')).toHaveAttribute('maxlength', '28')
    expect(screen.getByLabelText('Línea extra (opcional)')).toHaveAttribute('maxlength', '36')
  })

  it('la línea extra se guarda sola, sin espacios de sobra, y no hay botón "Guardar línea extra"', async () => {
    const f = vi.fn(async () => json({ promocion: { ...elegida, revision: 6, lineaExtra: 'Hot Sale · Solo este fin de semana' }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...conEscena({ promocion: elegida })} />)
    expect(screen.queryByRole('button', { name: 'Guardar línea extra' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: ' Hot Sale · Solo este fin de semana ' } })
    expect(screen.getByText(/^36\/60/)).toBeInTheDocument()
    fireEvent.blur(screen.getByLabelText('Línea extra (opcional)'))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, lineaExtra: 'Hot Sale · Solo este fin de semana' })
  })

  it('vaciarla la borra', async () => {
    const f = vi.fn(async () => json({ promocion: { ...elegida, revision: 6, lineaExtra: null }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...conEscena({ promocion: { ...elegida, lineaExtra: 'Hot Sale' } })} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Línea extra (opcional)'))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, lineaExtra: null })
  })

  it('con emojis avisa, no la guarda y no deja armar la versión final', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...conEscena({ promocion: elegida })} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hot Sale 🔥' } })
    fireEvent.blur(screen.getByLabelText('Línea extra (opcional)'))
    expect(screen.getByText(/No puede llevar emojis/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver la versión final' })).toBeDisabled()
    await new Promise((r) => setTimeout(r, 10))
    expect(f).not.toHaveBeenCalled()
  })

  it('el error del servidor por un monto distinto al cargado se ve en castellano', async () => {
    const f = vi.fn(async () => json({ error: 'Revisá lo que cambiaste.', errores: ['La línea extra solo puede mostrar el precio que cargaste, no otros montos ($ 3.900.000).'] }, 400))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...conEscena({ promocion: elegida })} />)
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hoy $ 3.900.000' } })
    fireEvent.blur(screen.getByLabelText('Línea extra (opcional)'))
    expect(await screen.findByRole('alert')).toHaveTextContent('solo puede mostrar el precio que cargaste')
  })

  it('la vista previa muestra en vivo lo que se escribe, antes de guardar', () => {
    render(<PasoPlaca {...conEscena({ promocion: elegida })} />)
    expect(screen.queryByText('Hot Sale · Solo este fin de semana')).toBeNull()
    fireEvent.change(screen.getByLabelText('Línea extra (opcional)'), { target: { value: 'Hot Sale · Solo este fin de semana' } })
    // en la vista previa grande y en las miniaturas de los estilos
    expect(screen.getAllByText('Hot Sale · Solo este fin de semana').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Llevátela hoy' } })
    expect(screen.getAllByText('Llevátela hoy').length).toBeGreaterThan(0)
  })

  it('un lector los ve deshabilitados', () => {
    render(<PasoPlaca {...conEscena({ promocion: elegida, puedeEditar: false })} />)
    expect(screen.getByLabelText('Línea extra (opcional)')).toBeDisabled()
    expect(screen.getByLabelText('Titular')).toBeDisabled()
  })
})

describe('<PasoPlaca> · foto de inspiración', () => {
  const insp = { id: 'i1', url: 'https://x/i1.jpg', borrada: false }
  const comprimirOk = vi.fn(async () => ({ ok: true as const, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), ancho: 1200, alto: 800 }))

  it('sin foto ofrece subir una (con el checkbox de derechos) y dice para qué sirve, en una línea', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    expect(screen.getByText(/Una imagen de referencia para copiar el estilo, la luz y el ambiente/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Elegir una foto de inspiración/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tengo derecho a usar esta foto/)).toBeInTheDocument()
  })

  it('al subirla se guarda en la promoción (inspiracionFotoId) con la revisión que veía', async () => {
    const f = vi.fn(async (u: string) => {
      if (u === '/api/fotos') return json({ foto: { id: 'i9', ancho: 1200, alto: 800, url: 'https://x/i9.jpg' } }, 201)
      return json({ promocion: { ...conDiseno, revision: 6, inspiracionFotoId: 'i9' }, avisos: [] })
    })
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={conDiseno} comprimirFoto={comprimirOk} />)
    fireEvent.change(screen.getByLabelText(/Elegir una foto de inspiración/), { target: { files: [new File([new Uint8Array([9])], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByLabelText(/Tengo derecho a usar esta foto/))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(f.mock.calls.some((c) => (c as unknown as [string])[0] === '/api/promociones/p1')).toBe(true))
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData).get('uso')).toBe('inspiracion')
    const patch = f.mock.calls.find((c) => (c as unknown as [string])[0] === '/api/promociones/p1') as unknown as [string, RequestInit]
    expect(JSON.parse(String(patch[1].body))).toEqual({ revision: 5, inspiracionFotoId: 'i9' })
  })

  it('con foto la muestra (miniatura) y deja quitarla', async () => {
    const f = vi.fn(async () => json({ promocion: { ...conDiseno, revision: 6, inspiracionFotoId: null }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, inspiracionFotoId: 'i1' }} inspiracion={insp} />)
    expect(screen.getByAltText('Foto de inspiración')).toHaveAttribute('src', 'https://x/i1.jpg')
    expect(screen.queryByLabelText(/Elegir una foto de inspiración/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la foto de inspiración' }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(cuerpoDe(f)).toEqual({ revision: 5, inspiracionFotoId: null })
  })

  it('una inspiración borrada se avisa y se puede sacar', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, inspiracionFotoId: 'i1' }} inspiracion={{ id: 'i1', url: null, borrada: true }} />)
    expect(screen.getByText(/La foto de inspiración se borró/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar la foto de inspiración' })).toBeInTheDocument()
  })

  it('un lector la ve pero no puede subir ni quitar', () => {
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, inspiracionFotoId: 'i1' }} inspiracion={insp} puedeEditar={false} />)
    expect(screen.getByAltText('Foto de inspiración')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar la foto de inspiración' })).toBeNull()
  })

  it('el precio avisa que incluye la inspiración, y es el que devuelve el servidor (Confirmar US$ X)', async () => {
    const f = vi.fn(async () => json(estimacion({ generacion: { id: 'g9', motor: 'gemini-nano-banana-2.1', cantidad: 2, aspecto: '4:5', porImagenUsd: 0.045, listaUsd: 0.0672, costoEstimadoUsd: 0.0934, venceEn: '2026-10-25T13:00:00Z', origen: 'promocion', conInspiracion: true } }), 201))
    vi.stubGlobal('fetch', f)
    render(<PasoPlaca {...props} promocion={{ ...conDiseno, inspiracionFotoId: 'i1' }} inspiracion={insp} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver precio' }))
    expect(await screen.findByRole('button', { name: 'Confirmar US$ 0,0934' })).toBeInTheDocument()
    expect(screen.getByText(/Incluye la foto de inspiración/)).toBeInTheDocument()
  })
})

describe('<PasoPlaca> · la pieza de una tanda no vuelve a pedir la imagen', () => {
  const hija = { ...conDiseno, tandaId: 'T1', fondo: 'solo_descripcion', inspiracionFotoId: 'i1', escenaCreativoId: ID_ESCENA }
  const insp = { id: 'i1', url: 'https://x/insp.jpg', borrada: false }

  it('no muestra el bloque de generar ni Ver precio, y manda a la tanda', () => {
    render(<PasoPlaca {...props} promocion={hija} inspiracion={insp} escenas={[gen()]} />)
    expect(screen.queryByRole('button', { name: 'Ver precio' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('opciones-imagen')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /generar otra en la tanda/ })).toHaveAttribute('href', '/promocionar/tanda/T1')
    expect(screen.getByAltText('Foto de inspiración')).toHaveAttribute('src', 'https://x/insp.jpg')
  })

  it('deja elegir la imagen de su moto y marca la que ya está en uso', () => {
    render(<PasoPlaca {...props} promocion={hija} inspiracion={insp} escenas={[gen()]} />)
    expect(screen.getByRole('radio', { name: 'Usar esta imagen' })).toBeChecked()
    expect(screen.getByText('En uso')).toBeInTheDocument()
  })

  it('una promoción suelta sigue mostrando el bloque para generar', () => {
    render(<PasoPlaca {...props} promocion={conDiseno} />)
    expect(screen.getByRole('button', { name: 'Ver precio' })).toBeInTheDocument()
    expect(screen.queryByTestId('imagen-de-la-tanda')).not.toBeInTheDocument()
  })
})
