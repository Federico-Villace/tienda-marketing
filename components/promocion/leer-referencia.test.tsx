import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeerReferencia } from './leer-referencia'
import type { LecturaVista } from '@/lib/promocion/referencia/lectura'
import { plantillaDePrueba } from '@/lib/promocion/referencia/fixture'

const leer = vi.fn()

const lista: LecturaVista = { id: 'l1', estado: 'lista', motivo: null, fallback: null, avisos: [], plantilla: plantillaDePrueba() }
const ok = (o: Record<string, unknown> = {}) => ({ ok: true, promocion: { id: 'p1', revision: 6 }, lectura: lista, costoUsd: 0.03, desdeCache: false, ...o })

const montar = (o: Partial<Parameters<typeof LeerReferencia>[0]> = {}) => {
  return render(<LeerReferencia costoUsd={0.08} gratis={false} puedeEditar apagado={null} deshabilitado={false} leer={leer} {...o} />)
}

beforeEach(() => leer.mockReset())

describe('<LeerReferencia> · la compuerta de costo', () => {
  it('mostrar el precio NO gasta: sin "Confirmar" no sale ningún pedido', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ }))
    expect(screen.getByRole('button', { name: /Confirmar US\$ 0,08/ })).toBeInTheDocument()
    expect(leer).not.toHaveBeenCalled()
  })

  it('"Confirmar US$ X" manda UN pedido con el precio que se vio y se aceptó', async () => {
    leer.mockResolvedValue(ok())
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar US\$ 0,08/ }))
    await waitFor(() => expect(leer).toHaveBeenCalledTimes(1))
    expect(leer).toHaveBeenCalledWith(0.08)
  })

  it('un doble click en Confirmar no duplica el pedido (ni el cobro)', async () => {
    let terminar!: (v: unknown) => void
    leer.mockReturnValue(new Promise((r) => (terminar = r)))
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ }))
    const confirmar = screen.getByRole('button', { name: /Confirmar US\$ 0,08/ })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    expect(leer).toHaveBeenCalledTimes(1)
    terminar(ok())
  })

  it('cancelar vuelve atrás sin pedir nada', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ }))
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(leer).not.toHaveBeenCalled()
  })

  it('si ya se leyó esta foto dice "gratis" y un click alcanza (sin paso de confirmar): se manda con precio 0', async () => {
    leer.mockResolvedValue(ok({ costoUsd: 0, desdeCache: true }))
    montar({ gratis: true })
    const b = screen.getByRole('button', { name: /gratis/ })
    expect(b).toBeInTheDocument()
    fireEvent.click(b)
    await waitFor(() => expect(leer).toHaveBeenCalledWith(0))
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })

  it('el lector no ve ningún control', () => {
    const { container } = montar({ puedeEditar: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('apagado (sin clave o sin tope): se explica y no se puede pedir', () => {
    montar({ apagado: 'Generar imágenes está apagado: falta la clave de Gemini.' })
    expect(screen.getByText(/falta la clave de Gemini/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ })).toBeDisabled()
  })

  it('sin precio calculable (modelo sin precio) no deja pedir', () => {
    montar({ costoUsd: null })
    expect(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ })).toBeDisabled()
  })
})

describe('<LeerReferencia> · errores y resultado', () => {
  async function pedirYConfirmar(respuesta: unknown, o: Partial<Parameters<typeof LeerReferencia>[0]> = {}) {
    leer.mockResolvedValue(respuesta)
    montar(o)
    fireEvent.click(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar US\$ 0,08/ }))
  }

  it('un error del servidor se muestra tal cual y se puede reintentar', async () => {
    await pedirYConfirmar({ ok: false, status: 402, error: 'Supera el tope mensual.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Supera el tope mensual.')
    expect(screen.getByRole('button', { name: /Leer el diseño de tu referencia/ })).toBeEnabled()
  })

  it('si lo que se cobró no sirvió, el error lo dice (viene en el mensaje del servidor)', async () => {
    await pedirYConfirmar({ ok: false, status: 502, error: 'La IA devolvió una lectura que no se pudo usar. No se aplicó nada. Se cobraron US$ 0,03.' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Se cobraron US\$ 0,03/)
  })

  it('un conflicto de revisión (409) se muestra, sin tocar nada más', async () => {
    await pedirYConfirmar({ ok: false, status: 409, error: 'Esta promoción cambió: recargá la pantalla.' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/recargá/)
  })

  it('al terminar bien avisa que quedó lista y cuánto costó', async () => {
    await pedirYConfirmar(ok({ costoUsd: 0.03 }))
    expect(await screen.findByText(/Costó US\$ 0,03/)).toBeInTheDocument()
  })

  it('una lectura que no sirvió dice por qué y qué plantilla se usó (se cobró igual)', async () => {
    const inutil: LecturaVista = { id: 'l1', estado: 'inutilizable', motivo: 'sin_moto', fallback: 'deportiva', avisos: [], plantilla: null }
    await pedirYConfirmar(ok({ lectura: inutil }))
    expect(await screen.findByText(/No se distingue la moto/)).toBeInTheDocument()
    expect(screen.getByText(/plantilla Deportiva/)).toBeInTheDocument()
  })

  it('los ajustes que hizo la reparación se cuentan en castellano', async () => {
    await pedirYConfirmar(ok({ lectura: { ...lista, avisos: [{ zona: 'frase', codigo: 'descartada_sin_espacio' }] } }))
    expect(await screen.findByText(/No había lugar para la frase/)).toBeInTheDocument()
  })
})
