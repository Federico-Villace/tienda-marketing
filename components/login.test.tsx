import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormularioLogin } from './login'

describe('FormularioLogin', () => {
  it('manda email y contraseña por POST al endpoint de login', () => {
    const { container } = render(<FormularioLogin />)
    const form = container.querySelector('form')!
    expect(form).toHaveAttribute('method', 'post')
    expect(form).toHaveAttribute('action', '/api/auth/login')
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('conserva a dónde volver después de entrar', () => {
    const { container } = render(<FormularioLogin volver="/tablero" />)
    expect(container.querySelector('input[name="volver"]')).toHaveValue('/tablero')
  })

  it.each([
    ['credenciales', /email o contraseña incorrectos/i],
    ['sin_acceso', /no tiene acceso/i],
    ['sin_config', /no está configurado/i],
  ])('muestra el error %s', (error, texto) => {
    render(<FormularioLogin error={error} />)
    expect(screen.getByRole('alert')).toHaveTextContent(texto)
  })

  it('un código de error desconocido no muestra nada raro', () => {
    render(<FormularioLogin error="<script>" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo entrar/i)
  })
})
