import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { ErrorDeCarga } from './error-de-carga'

describe('<ErrorDeCarga>', () => {
  it('dice algo humano y nunca el error crudo de Supabase', () => {
    render(<ErrorDeCarga />)
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo cargar. Probá de nuevo.')
    expect(alerta).not.toHaveTextContent(/Supabase|401|JWT/)
  })

  it('Reintentar vuelve a pedir la página al servidor', () => {
    router.refresh.mockClear()
    render(<ErrorDeCarga />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })
})
