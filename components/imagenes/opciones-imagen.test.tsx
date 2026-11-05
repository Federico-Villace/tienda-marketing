import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { OpcionesImagen } from './opciones-imagen'
import { opcionesDeImagen } from '@/lib/imagenes/opciones'

const base = (o: Partial<React.ComponentProps<typeof OpcionesImagen>> = {}) => ({
  opciones: opcionesDeImagen('foto'),
  fondo: 'fondo_estudio',
  onFondo: () => {},
  descripcion: '',
  onDescripcion: () => {},
  inspiracion: null,
  onInspiracion: () => {},
  motor: 'gemini-nano-banana-2.1',
  onMotor: () => {},
  cantidad: 1,
  onCantidad: () => {},
  puede: true,
  ocupado: false,
  ...o,
})

describe('<OpcionesImagen> · inspiraciones ya subidas', () => {
  const guardadas = [{ id: 'i1', creadoEn: '2026-10-25T10:00:00+00:00', url: 'https://x/i1.jpg' }]

  it('se puede elegir una que ya está subida, sin volver a subirla', () => {
    const onInspiracion = vi.fn()
    render(<OpcionesImagen {...base({ inspiraciones: guardadas, onInspiracion })} />)
    expect(screen.getByText('Elegir una que ya subiste')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Usar la inspiración subida el 2026-10-25/ }))
    expect(onInspiracion).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', url: 'https://x/i1.jpg' }))
  })

  it('sin guardadas no aparece la lista, y un lector no puede elegir', () => {
    const { unmount } = render(<OpcionesImagen {...base()} />)
    expect(screen.queryByText('Elegir una que ya subiste')).toBeNull()
    unmount()
    render(<OpcionesImagen {...base({ inspiraciones: guardadas, puede: false })} />)
    expect(screen.queryByText('Elegir una que ya subiste')).toBeNull()
  })
})
