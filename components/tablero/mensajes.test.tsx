import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MensajesRecibidos } from './mensajes'
import type { MensajesCuenta } from '@/lib/datos/mensajes'

const MARCA = '1327958853726987'
const fb: MensajesCuenta = { marcaId: MARCA, plataforma: 'facebook', activas: 4, nuevas: 3, mensajes: 17 }
const ig: MensajesCuenta = { marcaId: MARCA, plataforma: 'instagram', activas: 83, nuevas: null, mensajes: null }

const ok = (cuentas: MensajesCuenta[]) => ({ tipo: 'ok' as const, cuentas })
const tarjeta = (rotulo: string | RegExp) => screen.getByText(rotulo, { selector: 'p' }).parentElement!

describe('MensajesRecibidos', () => {
  it('Instagram: conversaciones activas; Facebook: activas, nuevas y mensajes', () => {
    render(<MensajesRecibidos estado={ok([fb, ig])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(tarjeta(/instagram · conversaciones activas/i)).toHaveTextContent('83')
    expect(tarjeta(/facebook · conversaciones activas/i)).toHaveTextContent('4')
    expect(tarjeta(/facebook · conversaciones nuevas/i)).toHaveTextContent('3')
    expect(tarjeta(/facebook · mensajes/i)).toHaveTextContent('17')
  })

  it('aclara que se cuentan por cuenta y período y que Instagram no tiene nuevas', () => {
    render(<MensajesRecibidos estado={ok([fb, ig])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(
      screen.getByText(
        'Meta no informa qué publicación generó cada mensaje: se cuentan por cuenta y por período. En Instagram no hay métrica de conversaciones nuevas; se muestran las activas.',
      ),
    ).toBeInTheDocument()
  })

  it('con el filtro de plataforma muestra solo esa red', () => {
    render(<MensajesRecibidos estado={ok([fb, ig])} filtros={{ marcaIds: [MARCA], plataforma: 'instagram' }} />)
    expect(screen.getByText(/instagram · conversaciones activas/i)).toBeInTheDocument()
    expect(screen.queryByText(/facebook ·/i)).not.toBeInTheDocument()
  })

  it('solo muestra la marca elegida', () => {
    render(<MensajesRecibidos estado={ok([fb, ig, { ...fb, marcaId: '999', activas: 999 }])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })

  it('un conteo que Meta no informa se ve como guion', () => {
    render(<MensajesRecibidos estado={ok([{ ...fb, nuevas: null }])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(tarjeta(/facebook · conversaciones nuevas/i)).toHaveTextContent('—')
  })

  it('un 0 real se muestra como 0, no como guion', () => {
    render(<MensajesRecibidos estado={ok([{ ...fb, activas: 0, nuevas: 0, mensajes: 0 }])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(tarjeta(/facebook · mensajes/i)).toHaveTextContent('0')
  })

  it('sin datos explica qué falta', () => {
    render(<MensajesRecibidos estado={ok([])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(screen.getByText(/todavía no hay mensajes sincronizados/i)).toBeInTheDocument()
  })

  it('si la base no responde, avisa sin romper el tablero', () => {
    render(<MensajesRecibidos estado={{ tipo: 'error', mensaje: 'Supabase 404' }} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Supabase 404')
  })
})
