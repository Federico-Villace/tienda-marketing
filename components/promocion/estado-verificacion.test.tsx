import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EstadoVerificacion } from './estado-verificacion'
import type { VerificacionVista } from '@/lib/promocion/copia/tipos'

const v = (o: Partial<VerificacionVista> = {}): VerificacionVista => ({ id: 'v1', estado: 'ok', diferencias: [], avisos: [], puedeReverificar: false, costoReverificarUsd: null, ...o })
const ok = { ok: true as const, verificacion: v(), costoUsd: 0.02 }

describe('<EstadoVerificacion>', () => {
  it('ok: textos revisados, con los avisos no bloqueantes', () => {
    render(<EstadoVerificacion verificacion={v({ avisos: [{ campo: 'frase', motivo: 'falta', esperado: 'Tu próxima moto', leido: null }] })} puedeEditar />)
    expect(screen.getByText('✓ Textos revisados')).toBeInTheDocument()
    expect(screen.getByText(/Frase: no aparece «Tu próxima moto»/)).toBeInTheDocument()
  })
  it('difiere: lista lo que no coincide y dice que no se puede usar; no ofrece repetir (se genera otra)', () => {
    render(<EstadoVerificacion verificacion={v({ estado: 'difiere', diferencias: [{ campo: 'precio', motivo: 'distinto', esperado: '$ 4.500.000', leido: '$ 4.500.00' }] })} puedeEditar reverificar={async () => ok} />)
    expect(screen.getByText(/no se puede usar/)).toBeInTheDocument()
    expect(screen.getByText('Precio: dice «$ 4.500.00», tenía que decir «$ 4.500.000»')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('error: lo dice y ofrece revisar de nuevo con su precio; el primer click NO manda nada', () => {
    const rev = vi.fn(async () => ok)
    render(<EstadoVerificacion verificacion={v({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })} puedeEditar reverificar={rev} />)
    expect(screen.getByText(/No se pudieron revisar los textos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar de nuevo · ~US$ 0,05' }))
    expect(rev).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirmar ~US$ 0,05' })).toBeInTheDocument()
  })
  it('Confirmar manda UN pedido con el precio que se vio (el doble click no duplica)', async () => {
    let resolver: (r: typeof ok) => void = () => {}
    const rev = vi.fn(() => new Promise<typeof ok>((res) => (resolver = res)))
    render(<EstadoVerificacion verificacion={v({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })} puedeEditar reverificar={rev} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar de nuevo/ }))
    const confirmar = screen.getByRole('button', { name: /Confirmar/ })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    expect(rev).toHaveBeenCalledTimes(1)
    expect(rev).toHaveBeenCalledWith(0.05)
    resolver(ok)
    await waitFor(() => expect(screen.queryByText('Revisando…')).toBeNull())
  })
  it('Cancelar vuelve atrás sin pedir nada', () => {
    const rev = vi.fn(async () => ok)
    render(<EstadoVerificacion verificacion={v({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })} puedeEditar reverificar={rev} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar de nuevo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: /Revisar de nuevo/ })).toBeInTheDocument()
    expect(rev).not.toHaveBeenCalled()
  })
  it('un error del servidor se muestra', async () => {
    const rev = vi.fn(async () => ({ ok: false as const, status: 402, error: 'Supera el tope mensual.' }))
    render(<EstadoVerificacion verificacion={v({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })} puedeEditar reverificar={rev} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar de nuevo/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    expect(await screen.findByText('Supera el tope mensual.')).toBeInTheDocument()
  })
  it('el lector ve el estado pero ningún botón', () => {
    render(<EstadoVerificacion verificacion={v({ estado: 'error', puedeReverificar: true, costoReverificarUsd: 0.05 })} puedeEditar={false} reverificar={async () => ok} />)
    expect(screen.getByText(/No se pudieron revisar/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('pendiente: "Revisando…"', () => {
    render(<EstadoVerificacion verificacion={v({ estado: 'pendiente' })} puedeEditar />)
    expect(screen.getByText('Revisando los textos…')).toBeInTheDocument()
  })
})
