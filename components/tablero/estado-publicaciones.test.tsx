import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoPublicaciones } from './estado-publicaciones'

describe('EstadoPublicaciones', () => {
  it('sin publicaciones dice que todavía no hay y no habla de muestra', () => {
    render(<EstadoPublicaciones tipo="vacio" />)
    expect(screen.getByText(/todavía no hay publicaciones/i)).toBeTruthy()
    expect(screen.queryByText(/muestra/i)).toBeNull()
  })

  it('si la lectura falla muestra la alerta con el mensaje', () => {
    render(<EstadoPublicaciones tipo="error" mensaje="Supabase 500" />)
    expect(screen.getByRole('alert').textContent).toContain('Supabase 500')
  })
})
