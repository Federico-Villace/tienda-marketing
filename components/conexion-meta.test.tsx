import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConexionMeta } from './conexion-meta'

describe('ConexionMeta', () => {
  it('ofrece el botón que arranca el login de Facebook', () => {
    render(<ConexionMeta resultado={null} />)
    expect(screen.getByRole('link', { name: /conectar con facebook/i })).toHaveAttribute(
      'href',
      '/api/meta/login',
    )
  })

  it('muestra el tipo de token y que no vence cuando salió bien', () => {
    render(
      <ConexionMeta resultado={{ ok: true, tipo: 'SYSTEM_USER', vence: 'nunca', faltan: [] }} />,
    )
    expect(screen.getByText(/SYSTEM_USER/)).toBeInTheDocument()
    expect(screen.getByText(/no vence/i)).toBeInTheDocument()
    expect(screen.getByText(/están todos los permisos/i)).toBeInTheDocument()
  })

  it('lista los permisos que faltan para que se corrija la configuración', () => {
    render(
      <ConexionMeta
        resultado={{ ok: true, tipo: 'USER', vence: '2026-12-11T00:00:00.000Z', faltan: ['ads_read'] }}
      />,
    )
    expect(screen.getByText('ads_read')).toBeInTheDocument()
  })

  it('muestra el error con el detalle de Meta', () => {
    render(
      <ConexionMeta resultado={{ ok: false, mensaje: 'Meta rechazó el pedido.', detalle: 'Code expired' }} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Meta rechazó el pedido\..*Code expired/)
  })
})
