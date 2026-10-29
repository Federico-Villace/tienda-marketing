import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedirCambioTexto } from './pedir-cambio-texto'
import type { VersionTexto } from '@/lib/promocion/textos/versiones'
import { copyDePrueba } from '@/lib/promocion/fixture'

const props = () => ({ costo: '~US$ 0,001', habilitado: true, puedeEditar: true, pedir: vi.fn(async () => ({ ok: true as const })), alTerminar: vi.fn() })
const escribir = (t: string) => fireEvent.change(screen.getByLabelText('Pedile un cambio a la IA'), { target: { value: t } })
const pedirCambio = () => fireEvent.click(screen.getByRole('button', { name: /Pedir cambio/ }))

describe('PedirCambioTexto', () => {
  it('sin click no se pide nada; con menos de 3 letras el botón no se habilita; el contador no pasa de 400', () => {
    const p = props()
    render(<PedirCambioTexto {...p} />)
    expect(p.pedir).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Pedir cambio/ })).toBeDisabled()
    expect(screen.getByLabelText('Pedile un cambio a la IA')).toHaveAttribute('maxlength', '400')
    escribir('más corto')
    expect(screen.getByRole('button', { name: /Pedir cambio/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Pedir cambio/ })).toHaveTextContent('~US$ 0,001')
  })

  it('pide con el texto limpio, avisa al terminar y vacía el campo', async () => {
    const p = props()
    render(<PedirCambioTexto {...p} />)
    escribir('  más corto y directo ')
    pedirCambio()
    await waitFor(() => expect(p.alTerminar).toHaveBeenCalledTimes(1))
    expect(p.pedir).toHaveBeenCalledWith('más corto y directo')
    expect(screen.getByLabelText('Pedile un cambio a la IA')).toHaveValue('')
  })

  it('doble click: un solo pedido, y el botón queda deshabilitado mientras corre', async () => {
    let terminar!: (r: { ok: true }) => void
    const p = { ...props(), pedir: vi.fn(() => new Promise<{ ok: true }>((r) => (terminar = r))) }
    render(<PedirCambioTexto {...p} />)
    escribir('más corto')
    const boton = screen.getByRole('button', { name: /Pedir cambio/ })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(p.pedir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Pedir cambio/ })).toBeDisabled()
    terminar({ ok: true })
    await waitFor(() => expect(p.alTerminar).toHaveBeenCalledTimes(1))
  })

  it.each([
    [429, 'Llegaste al tope de cambios por IA.'],
    [502, 'La IA devolvió un texto que no cumple las reglas: probá con otro pedido.'],
    [409, 'Cambió mientras se pedía: recargá la pantalla.'],
  ])('un error %s del servidor se muestra y no se refresca', async (status, error) => {
    const p = { ...props(), pedir: vi.fn(async () => ({ ok: false as const, status, error })) }
    render(<PedirCambioTexto {...p} />)
    escribir('más corto')
    pedirCambio()
    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(p.alTerminar).not.toHaveBeenCalled()
  })

  it('el lector no ve nada; sin clave de OpenAI no se puede pedir', () => {
    const { rerender } = render(<PedirCambioTexto {...props()} puedeEditar={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    rerender(<PedirCambioTexto {...props()} habilitado={false} />)
    escribir('más corto')
    expect(screen.getByRole('button', { name: /Pedir cambio/ })).toBeDisabled()
  })

  describe('versiones', () => {
    const versiones: VersionTexto[] = [
      { clave: 'original', etiqueta: 'Original', pedido: null, copy: copyDePrueba({ titular: 'Uno' }), actual: false },
      { clave: 't1', etiqueta: 'Cambio 1', pedido: 'más corto', copy: copyDePrueba({ titular: 'Dos' }), actual: true },
    ]
    it('"Usar esta" solo aparece en las que no son la actual y solo actúa tras el click', async () => {
      const p = props()
      const alUsar = vi.fn(async () => ({ ok: true as const }))
      render(<PedirCambioTexto {...p} versiones={versiones} alUsar={alUsar} />)
      expect(alUsar).not.toHaveBeenCalled()
      const botones = screen.getAllByRole('button', { name: 'Usar esta' })
      expect(botones).toHaveLength(1)
      fireEvent.click(botones[0]!)
      await waitFor(() => expect(alUsar).toHaveBeenCalledWith(versiones[0]))
      expect(p.alTerminar).toHaveBeenCalled()
    })

    it('con una sola versión no se muestra la lista', () => {
      render(<PedirCambioTexto {...props()} versiones={[versiones[0]!]} alUsar={vi.fn()} />)
      expect(screen.queryByRole('list', { name: 'Versiones del texto' })).toBeNull()
    })
  })
})
