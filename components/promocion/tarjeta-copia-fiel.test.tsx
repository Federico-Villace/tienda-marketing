import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { TarjetaCopiaFiel } from './tarjeta-copia-fiel'

const base = { elegida: false, puedeEditar: true, bloqueado: false, inspiraciones: [{ id: 'i9', url: 'https://x/i9.jpg', creadoEn: '2026-11-10T10:00:00Z' }] }
const foto = { id: 'i1', url: 'https://x/i1.jpg', borrada: false }

describe('<TarjetaCopiaFiel>', () => {
  it('sin foto: deja elegir una ya subida y un solo click guarda la plantilla con esa foto', () => {
    const alElegir = vi.fn()
    render(<TarjetaCopiaFiel {...base} foto={null} alElegir={alElegir} />)
    expect(screen.getByRole('radio', { name: /Copia fiel de tu referencia/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Usar la inspiración subida el 2026-11-10/ }))
    expect(alElegir).toHaveBeenCalledWith({ id: 'i9', ancho: 0, alto: 0, url: 'https://x/i9.jpg' })
  })
  it('con foto: "Referencia elegida", sin vista previa de la referencia, y el radio elige la plantilla (sin foto nueva)', () => {
    const alElegir = vi.fn()
    const { container } = render(<TarjetaCopiaFiel {...base} foto={foto} alElegir={alElegir} />)
    expect(screen.getByText('✓ Referencia elegida')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Copia fiel de tu referencia/ }))
    expect(alElegir).toHaveBeenCalledWith()
  })
  it('"Cambiar" abre el selector; elegir otra la pone en el mismo guardado y lo cierra', () => {
    const alElegir = vi.fn()
    render(<TarjetaCopiaFiel {...base} foto={foto} alElegir={alElegir} />)
    expect(screen.queryByRole('button', { name: /Usar la inspiración/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.click(screen.getByRole('button', { name: /Usar la inspiración subida el 2026-11-10/ }))
    expect(alElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 'i9' }))
    expect(screen.queryByRole('button', { name: /Usar la inspiración/ })).toBeNull()
  })
  it('una foto borrada pide subir otra', () => {
    render(<TarjetaCopiaFiel {...base} foto={{ ...foto, borrada: true }} alElegir={() => {}} />)
    expect(screen.getByText(/La foto de referencia se borró/)).toBeInTheDocument()
    expect(screen.getByRole('radio')).toBeDisabled()
  })
  it('elegida: el radio está tildado', () => {
    render(<TarjetaCopiaFiel {...base} elegida foto={foto} alElegir={() => {}} />)
    expect(screen.getByRole('radio', { name: /Copia fiel de tu referencia/ })).toBeChecked()
  })
  it('el lector ve la tarjeta sin ningún control', () => {
    render(<TarjetaCopiaFiel {...base} puedeEditar={false} elegida foto={foto} alElegir={() => {}} />)
    const t = screen.getByTestId('tarjeta-copia-fiel')
    expect(within(t).getByRole('radio')).toBeDisabled()
    expect(within(t).queryByRole('button')).toBeNull()
  })
  it('mientras se guarda nada se toca', () => {
    render(<TarjetaCopiaFiel {...base} bloqueado foto={foto} alElegir={() => {}} />)
    expect(screen.getByRole('radio')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeDisabled()
  })
})
