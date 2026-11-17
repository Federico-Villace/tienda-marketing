import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoDatosVarias } from './paso-datos-varias'
import { MARCAS } from '@/lib/datos/marcas'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const comprimirOk = vi.fn(async () => ({ ok: true as const, blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), ancho: 1500, alto: 1500 }))
const archivo = (n: number) => new File([new Uint8Array([n])], `IMG_${n}.jpg`, { type: 'image/jpeg' })

let subidas = 0
function red(o: { promocion?: () => Response } = {}) {
  subidas = 0
  const f = vi.fn(async (u: RequestInfo | URL) => {
    const url = String(u)
    if (url === '/api/fotos') return json({ foto: { id: `foto-${++subidas}`, ancho: 1500, alto: 1500, url: null } }, 201)
    if (url === '/api/promociones') return (o.promocion ?? (() => json({ promocion: { id: 'P1', pasoActual: 2 } }, 201)))()
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

const montar = (puedeEditar = true) => render(<PasoDatosVarias puedeEditar={puedeEditar} comprimirFoto={comprimirOk} />)
const fila = (n: number) => screen.getByRole('group', { name: `Moto ${n}` })
const llenar = (n: number, modelo: string, precio: string) => {
  fireEvent.change(within(fila(n)).getByLabelText('Modelo'), { target: { value: modelo } })
  fireEvent.change(within(fila(n)).getByLabelText('Precio'), { target: { value: precio } })
}
const elegirFoto = (n: number) => fireEvent.change(within(fila(n)).getByLabelText(/Foto de la moto/), { target: { files: [archivo(n)] } })
const derechos = () => fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
const crear = () => screen.getByRole('button', { name: /Crear la placa/ })
const marca = () => fireEvent.change(screen.getByLabelText('Marca'), { target: { value: MARCAS[3]!.id } })

describe('<PasoDatosVarias> · el formulario', () => {
  it('arranca con 2 motos, sin marca y con Crear deshabilitado', () => {
    montar()
    expect(screen.getByRole('heading', { name: '¿Qué motos van en la placa?' })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(2)
    expect(crear()).toBeDisabled()
  })
  it('se agregan motos hasta 4 y se quitan hasta dejar 2', () => {
    montar()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar moto' }))
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(4)
    expect(screen.getByRole('button', { name: '+ Agregar moto' })).toBeDisabled()
    for (let i = 0; i < 2; i++) fireEvent.click(within(fila(2)).getByRole('button', { name: /Quitar la moto/ }))
    expect(screen.getAllByRole('group', { name: /^Moto \d+$/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Quitar la moto/ })).toBeNull()
  })
  it('es UNA marca (un select), no una por moto', () => {
    montar()
    expect(screen.getByLabelText('Marca').tagName).toBe('SELECT')
    expect(screen.getAllByLabelText('Marca')).toHaveLength(1)
  })
  it('un lector ve el formulario deshabilitado y sin botón de crear', () => {
    montar(false)
    expect(screen.queryByRole('button', { name: /Crear la placa/ })).toBeNull()
    expect(within(fila(1)).getByLabelText('Modelo')).toBeDisabled()
    expect(screen.getByLabelText('Marca')).toBeDisabled()
  })
  it('dice qué pasa después: con referencia la IA, sin referencia una grilla gratis', () => {
    montar()
    expect(screen.getByText(/grilla/i)).toBeInTheDocument()
  })
})

describe('<PasoDatosVarias> · crear la placa', () => {
  async function completo(motos = 2) {
    montar()
    marca()
    for (let i = 2; i < motos; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar moto' }))
    for (let n = 1; n <= motos; n++) llenar(n, `Moto ${n}`, String(n * 1_000_000))
    derechos()
    for (let n = 1; n <= motos; n++) elegirFoto(n)
    for (let n = 1; n <= motos; n++) await waitFor(() => expect(within(fila(n)).getByText('Foto lista')).toBeInTheDocument())
  }

  it('Crear se habilita cuando están la marca, TODOS los datos y TODAS las fotos', async () => {
    red()
    montar()
    llenar(1, 'TRK 502', '4500000')
    llenar(2, 'Leoncino', '5200000')
    derechos()
    elegirFoto(1)
    elegirFoto(2)
    await waitFor(() => expect(within(fila(2)).getByText('Foto lista')).toBeInTheDocument())
    await waitFor(() => expect(within(fila(1)).getByText('Foto lista')).toBeInTheDocument())
    expect(crear()).toBeDisabled()
    marca()
    expect(crear()).toBeEnabled()
  })

  it('manda UNA promoción: la moto 1 como principal y las otras en `motos`, y sigue al paso que le toca', async () => {
    const f = red()
    await completo(3)
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Berazategui' } })
    fireEvent.click(crear())
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/P1?paso=2'))
    const llamadas = (f.mock.calls as unknown as [string, RequestInit][]).filter(([u]) => u === '/api/promociones')
    expect(llamadas).toHaveLength(1)
    expect(JSON.parse(String(llamadas[0]![1].body))).toEqual({
      marcaId: MARCAS[3]!.id,
      modelo: 'Moto 1',
      precio: { moneda: 'ARS', monto: 1_000_000 },
      promo: { tipo: 'contado', detalle: '' },
      lugar: 'Berazategui',
      indicaciones: '',
      fotoId: 'foto-1',
      aspecto: '4:5',
      motos: [
        { fotoId: 'foto-2', modelo: 'Moto 2', precio: { moneda: 'ARS', monto: 2_000_000 }, promo: { tipo: 'contado', detalle: '' } },
        { fotoId: 'foto-3', modelo: 'Moto 3', precio: { moneda: 'ARS', monto: 3_000_000 }, promo: { tipo: 'contado', detalle: '' } },
      ],
    })
  })

  it('un doble click no crea dos promociones', async () => {
    const f = red()
    await completo()
    const boton = crear()
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(router.push).toHaveBeenCalled())
    expect((f.mock.calls as unknown as [string][]).filter(([u]) => u === '/api/promociones')).toHaveLength(1)
  })

  it('los errores del servidor se muestran, no navega y no se pierde lo cargado', async () => {
    red({ promocion: () => json({ error: 'Revisá los datos de la promoción.', errores: ['Moto 2: El precio tiene que ser un número entero.'] }, 400) })
    await completo()
    fireEvent.click(crear())
    expect(await screen.findByRole('alert')).toHaveTextContent('Moto 2: El precio tiene que ser un número entero.')
    expect(router.push).not.toHaveBeenCalled()
    expect(within(fila(2)).getByLabelText('Precio')).toHaveValue('2000000')
    expect(crear()).toBeEnabled()
  })

  it('no se sube nada hasta aceptar la declaración de derechos', async () => {
    const f = red()
    montar()
    elegirFoto(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(f).not.toHaveBeenCalled()
  })
})
