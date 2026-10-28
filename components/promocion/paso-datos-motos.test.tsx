import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoDatosMotos } from './paso-datos-motos'
import { MARCAS } from '@/lib/datos/marcas'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const comprimirOk = vi.fn(async () => ({ ok: true as const, blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1500, alto: 1500 }))
const archivo = (n: number) => new File([new Uint8Array([n])], `IMG_${n}.jpg`, { type: 'image/jpeg' })

let subidas = 0
function red(o: { tanda?: () => Response } = {}) {
  subidas = 0
  const f = vi.fn(async (u: RequestInfo | URL) => {
    const url = String(u)
    if (url === '/api/fotos') return json({ foto: { id: `foto-${++subidas}`, ancho: 1500, alto: 1500, url: null } }, 201)
    if (url === '/api/tandas') return (o.tanda ?? (() => json({ tanda: { id: 'T9', tipo: 'motos' }, promociones: [] }, 201)))()
    throw new Error(`URL inesperada ${url}`)
  })
  vi.stubGlobal('fetch', f)
  return f
}
beforeEach(() => {
  router.push.mockClear()
  comprimirOk.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

const montar = (puedeEditar = true) => render(<PasoDatosMotos puedeEditar={puedeEditar} comprimirFoto={comprimirOk} />)
const fila = (n: number) => screen.getByRole('group', { name: `Moto ${n}` })
const llenar = (n: number, modelo: string, precio: string) => {
  fireEvent.change(within(fila(n)).getByLabelText('Modelo'), { target: { value: modelo } })
  fireEvent.change(within(fila(n)).getByLabelText('Precio'), { target: { value: precio } })
}
const elegirFoto = (n: number, a = archivo(n)) => fireEvent.change(within(fila(n)).getByLabelText(/Foto de la moto/), { target: { files: [a] } })
const derechos = () => fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
const crear = () => screen.getByRole('button', { name: /Crear/ })

describe('<PasoDatosMotos> · el formulario', () => {
  it('arranca con 2 motos, sin nada elegido y con Crear deshabilitado', () => {
    montar()
    expect(screen.getByRole('heading', { name: '¿Qué motos querés promocionar?' })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(2)
    expect(crear()).toBeDisabled()
    expect(screen.getByText('Elegí al menos una marca.')).toBeInTheDocument()
  })

  it('se agregan motos hasta 10 y se quitan hasta dejar 2', () => {
    montar()
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar moto' }))
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(10)
    expect(screen.getByRole('button', { name: '+ Agregar moto' })).toBeDisabled()
    for (let i = 0; i < 8; i++) fireEvent.click(within(fila(2)).getByRole('button', { name: /Quitar la moto/ }))
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Quitar la moto/ })).toBeNull()
  })

  it('dice cuántas placas se van a armar (motos × marcas) y se queja si pasan de 14', () => {
    montar()
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[5]!.nombre }))
    expect(screen.getByText('Se van a armar 4 placas: 2 motos × 2 marcas.')).toBeInTheDocument()
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar moto' }))
    expect(screen.getByText('Se van a armar 14 placas: 7 motos × 2 marcas.')).toBeInTheDocument()
  })

  it('con 8 motos y 2 marcas son 16 placas: lo dice y no deja crear', () => {
    montar()
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[5]!.nombre }))
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar moto' }))
    expect(screen.getByText('Son 16 placas: el máximo por lote es 14. Sacá motos o marcas.')).toBeInTheDocument()
    expect(crear()).toBeDisabled()
  })

  it('el precio se escribe como número y se ve cómo va a quedar', () => {
    montar()
    llenar(1, 'TRK 502', '4500000')
    expect(within(fila(1)).getByText('Se va a ver así: $ 4.500.000')).toBeInTheDocument()
    fireEvent.change(within(fila(1)).getByLabelText('Precio'), { target: { value: '4.500.000' } })
    expect(within(fila(1)).getByText('Escribí solo números, sin puntos ni símbolos: 4500000.')).toBeInTheDocument()
  })

  it('un lector ve el formulario deshabilitado y sin botón de crear', () => {
    montar(false)
    expect(screen.queryByRole('button', { name: /Crear/ })).toBeNull()
    expect(within(fila(1)).getByLabelText('Modelo')).toBeDisabled()
  })
})

describe('<PasoDatosMotos> · las fotos', () => {
  it('no se sube nada hasta aceptar la declaración de derechos (una sola para todo el lote)', async () => {
    const f = red()
    montar()
    elegirFoto(1)
    expect(within(fila(1)).getByText('Foto elegida: se sube al aceptar la declaración de derechos.')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(f).not.toHaveBeenCalled()
    derechos()
    await waitFor(() => expect(within(fila(1)).getByText('Foto lista')).toBeInTheDocument())
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('cada foto se sube al elegirla; una que falla se reintenta sola y no frena a las demás', async () => {
    let n = 0
    const f = vi.fn(async (u: RequestInfo | URL) => {
      if (String(u) !== '/api/fotos') throw new Error('x')
      n++
      return n === 1 ? json({ error: 'La foto pesa demasiado.' }, 413) : json({ foto: { id: `foto-${n}`, ancho: 1500, alto: 1500, url: null } }, 201)
    })
    vi.stubGlobal('fetch', f)
    montar()
    derechos()
    elegirFoto(1)
    elegirFoto(2)
    await waitFor(() => expect(within(fila(2)).getByText('Foto lista')).toBeInTheDocument())
    expect(await within(fila(1)).findByText('La foto pesa demasiado.')).toBeInTheDocument()
    fireEvent.click(within(fila(1)).getByRole('button', { name: 'Reintentar la foto' }))
    await waitFor(() => expect(within(fila(1)).getByText('Foto lista')).toBeInTheDocument())
  })
})

describe('<PasoDatosMotos> · crear el lote', () => {
  async function completo() {
    montar()
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    llenar(1, 'TRK 502', '4500000')
    llenar(2, 'Leoncino', '5200000')
    derechos()
    elegirFoto(1)
    elegirFoto(2)
    await waitFor(() => expect(within(fila(2)).getByText('Foto lista')).toBeInTheDocument())
    await waitFor(() => expect(within(fila(1)).getByText('Foto lista')).toBeInTheDocument())
  }

  it('Crear se habilita cuando están TODOS los datos y TODAS las fotos arriba', async () => {
    red()
    montar()
    fireEvent.click(screen.getByRole('checkbox', { name: MARCAS[3]!.nombre }))
    llenar(1, 'TRK 502', '4500000')
    llenar(2, 'Leoncino', '5200000')
    expect(crear()).toBeDisabled()
    derechos()
    elegirFoto(1)
    expect(crear()).toBeDisabled()
    elegirFoto(2)
    await waitFor(() => expect(crear()).toBeEnabled())
  })

  it('manda el lote a /api/tandas con cada moto (foto subida, modelo, precio, promo) y va a la tanda', async () => {
    const f = red()
    await completo()
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Berazategui' } })
    fireEvent.click(crear())
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/tanda/T9'))
    const llamada = (f.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u === '/api/tandas')!
    expect(JSON.parse(String(llamada[1].body))).toEqual({
      tipo: 'motos',
      marcaIds: [MARCAS[3]!.id],
      aspecto: '4:5',
      lugar: 'Berazategui',
      indicaciones: '',
      motos: [
        { fotoId: 'foto-1', modelo: 'TRK 502', precio: { moneda: 'ARS', monto: 4500000 }, promo: { tipo: 'contado', detalle: '' } },
        { fotoId: 'foto-2', modelo: 'Leoncino', precio: { moneda: 'ARS', monto: 5200000 }, promo: { tipo: 'contado', detalle: '' } },
      ],
    })
  })

  it('un doble click no crea dos lotes', async () => {
    const f = red({ tanda: () => json({ tanda: { id: 'T9', tipo: 'motos' }, promociones: [] }, 201) })
    await completo()
    const boton = crear()
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(router.push).toHaveBeenCalled())
    expect((f.mock.calls as unknown as [string][]).filter(([u]) => u === '/api/tandas')).toHaveLength(1)
  })

  it('los errores del servidor se muestran en castellano y no navega', async () => {
    red({ tanda: () => json({ error: 'Revisá los datos del lote.', errores: ['Moto 2: El precio tiene que ser un número entero.'] }, 400) })
    await completo()
    fireEvent.click(crear())
    expect(await screen.findByRole('alert')).toHaveTextContent('Moto 2: El precio tiene que ser un número entero.')
    expect(router.push).not.toHaveBeenCalled()
  })
})
