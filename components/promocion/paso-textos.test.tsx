import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoTextos } from './paso-textos'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const opciones = [
  copyDePrueba({ titular: 'Primera aventura', hook: 'Hook uno' }),
  copyDePrueba({ titular: 'Segunda ruta', hook: 'Hook dos' }),
  copyDePrueba({ titular: 'Tercera vez', hook: 'Hook tres' }),
]
const textos = { id: 't1', opciones, intento: 1, desactualizado: false }
const base = vistaDePromocion(filaPromocion({ id: 'p1', revision: 2 }))
const props = { promocion: base, textos: null, habilitado: true, puedeEditar: true, costo: '~US$ 0,003' }

beforeEach(() => {
  router.refresh.mockClear()
  router.push.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoTextos> · pedir los textos', () => {
  it('el botón dice qué hace y cuánto cuesta', () => {
    render(<PasoTextos {...props} />)
    expect(screen.getByRole('button', { name: 'Escribir 3 textos · ~US$ 0,003' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: /Seguir a la imagen/ })).toBeNull()
  })

  it('manda la revisión que veía y muestra las 3 opciones', async () => {
    const f = vi.fn(async () => json({ textos: { ...textos, costoUsd: 0.003, desdeCache: false }, promocion: { ...base, revision: 3, textosId: 't1' } }))
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Escribir 3 textos/ }))
    expect(await screen.findAllByRole('radio')).toHaveLength(3)
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 2 })
    expect(screen.getByText('Primera aventura')).toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalled()
  })

  it('un doble click hace un solo pedido', async () => {
    const f = vi.fn(async () => json({ textos: { ...textos, costoUsd: 0, desdeCache: false }, promocion: base }))
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} />)
    const b = screen.getByRole('button', { name: /Escribir 3 textos/ })
    fireEvent.click(b)
    fireEvent.click(b)
    await screen.findAllByRole('radio')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('si el redactor devolvió algo inválido (502) lo dice y deja reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'El redactor devolvió textos inválidos. Probá de nuevo.' }, 502)))
    render(<PasoTextos {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Escribir 3 textos/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('textos inválidos')
    expect(screen.getByRole('button', { name: /Escribir 3 textos/ })).toBeEnabled()
  })

  it('apagado (sin clave): deshabilitado y con motivo; el lector ni lo ve', () => {
    const { unmount } = render(<PasoTextos {...props} habilitado={false} />)
    expect(screen.getByRole('button', { name: /Escribir 3 textos/ })).toBeDisabled()
    expect(screen.getByText(/está apagada/)).toBeInTheDocument()
    unmount()
    render(<PasoTextos {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: /Escribir 3 textos/ })).toBeNull()
  })
})

describe('<PasoTextos> · elegir', () => {
  it('cada opción es un radio con su titular y el gancho; ninguna viene elegida', () => {
    render(<PasoTextos {...props} textos={textos} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const r of radios) expect(r).not.toBeChecked()
    expect(screen.getByText('Hook dos')).toBeInTheDocument()
  })

  it('elegir una guarda SOLO el número de opción (el texto sale del servidor) y habilita seguir', async () => {
    const elegida = { ...base, revision: 3, copy: opciones[1]!, copyOpcion: 2, copyEditado: false, titular: 'Segunda ruta', pasoActual: 4 }
    const f = vi.fn(async () => json({ promocion: elegida, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} textos={textos} />)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    await waitFor(() => expect(screen.getAllByRole('radio')[1]).toBeChecked())
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 2, copyOpcion: 2 })
    expect(screen.getByRole('link', { name: /Seguir a la imagen/ })).toHaveAttribute('href', '/promocionar/p1?paso=4')
  })

  it('con un texto ya elegido, su opción viene marcada', () => {
    const elegida = { ...base, copy: opciones[2]!, copyOpcion: 3, copyEditado: false }
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    expect(screen.getAllByRole('radio')[2]).toBeChecked()
  })

  it('si el texto elegido fue editado, ninguna opción figura como la elegida y se aclara', () => {
    const elegida = { ...base, copy: { ...opciones[0]!, hook: 'Retocado' }, copyOpcion: 1, copyEditado: true }
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(screen.getByText(/Editaste este texto a mano/)).toBeInTheDocument()
  })
})

describe('<PasoTextos> · editar', () => {
  const elegida = { ...base, revision: 3, copy: opciones[0]!, copyOpcion: 1, copyEditado: false }

  it('abre un formulario con contadores y guarda el texto entero con la opción de la que sale', async () => {
    const f = vi.fn(async () => json({ promocion: { ...elegida, revision: 4, copyEditado: true }, avisos: [] }))
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar este texto' }))
    expect(screen.getByText('16/40')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Gancho'), { target: { value: 'Un gancho nuevo' } })
    fireEvent.change(screen.getByLabelText('Hashtags'), { target: { value: '#uno  #dos #tres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar texto' }))
    await waitFor(() => expect(screen.queryByLabelText('Gancho')).toBeNull())
    const cuerpo = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(cuerpo).toMatchObject({ revision: 3, copyOpcion: 1, copy: { hook: 'Un gancho nuevo', hashtags: ['#uno', '#dos', '#tres'], titular: 'Primera aventura' } })
  })

  it('los errores de validación del servidor se muestran', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Revisá el texto.', errores: ['La mención @otra no es la cuenta de la marca.'] }, 400)))
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar este texto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar texto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La mención @otra')
    expect(screen.getByLabelText('Gancho')).toBeInTheDocument()
  })

  it('cancelar descarta los cambios sin llamar al servidor', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar este texto' }))
    fireEvent.change(screen.getByLabelText('Gancho'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Gancho')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('<PasoTextos> · avisos y otras 3', () => {
  it('un [precio] sin completar se avisa', () => {
    const elegida = { ...base, copy: { ...opciones[0]!, copy: 'Hoy a [precio].' }, copyOpcion: 1, copyEditado: true }
    render(<PasoTextos {...props} promocion={elegida} textos={textos} />)
    expect(screen.getByRole('status')).toHaveTextContent(/\[precio\]/)
  })

  it('"Pedir otras 3" lleva el precio, manda otras:true y reemplaza las opciones', async () => {
    const nuevas = [copyDePrueba({ titular: 'Nueva A' }), copyDePrueba({ titular: 'Nueva B' }), copyDePrueba({ titular: 'Nueva C' })]
    const f = vi.fn(async () => json({ textos: { id: 't2', opciones: nuevas, intento: 2, costoUsd: 0.003, desdeCache: false, desactualizado: false }, promocion: { ...base, revision: 4 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoTextos {...props} textos={textos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pedir otras 3 · ~US$ 0,003' }))
    expect(await screen.findByText('Nueva A')).toBeInTheDocument()
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 2, otras: true })
  })

  it('si cambiaste los datos después de escribir, lo avisa', () => {
    render(<PasoTextos {...props} textos={{ ...textos, desactualizado: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/cambiaste los datos/i)
  })

  it('una promoción aprobada no pide ni elige', () => {
    render(<PasoTextos {...props} promocion={{ ...base, estado: 'aprobada', copy: opciones[0]!, copyOpcion: 1 }} textos={textos} />)
    expect(screen.queryByRole('button', { name: /Pedir otras 3/ })).toBeNull()
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
    expect(within(document.body).queryByRole('button', { name: 'Editar este texto' })).toBeNull()
  })

  it('un 409 pide recargar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Esta promoción cambió: recargá la pantalla.' }, 409)))
    render(<PasoTextos {...props} textos={textos} />)
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent('recargá la pantalla')
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(router.refresh).toHaveBeenCalled()
  })
})
