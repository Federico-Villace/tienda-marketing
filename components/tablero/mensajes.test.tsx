import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

describe('MensajesRecibidos · varias marcas', () => {
  const SUZUKI = '100206789578448'
  const fbS: MensajesCuenta = { marcaId: SUZUKI, plataforma: 'facebook', activas: 6, nuevas: 2, mensajes: 10 }
  const igS: MensajesCuenta = { marcaId: SUZUKI, plataforma: 'instagram', activas: 7, nuevas: null, mensajes: null }
  const dos = { marcaIds: [SUZUKI, MARCA], plataforma: 'todas' as const }

  it('las tarjetas son la SUMA de las marcas elegidas', () => {
    render(<MensajesRecibidos estado={ok([fb, ig, fbS, igS])} filtros={dos} />)
    expect(tarjeta(/instagram · conversaciones activas/i)).toHaveTextContent('90')
    expect(tarjeta(/facebook · conversaciones activas/i)).toHaveTextContent('10')
    expect(tarjeta(/facebook · mensajes/i)).toHaveTextContent('27')
  })

  it('una tabla "Por marca" con una fila por marca (nombre, no id)', () => {
    render(<MensajesRecibidos estado={ok([fb, ig, fbS, igS])} filtros={dos} />)
    const tabla = screen.getByRole('table', { name: /mensajes por marca/i })
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent('Suzuki Quilmes')
    expect(filas[0]).toHaveTextContent('7')
    expect(filas[1]).toHaveTextContent('Zontes Quilmes')
    expect(filas[1]).toHaveTextContent('83')
  })

  it('un valor que Meta no informa se ve como guion, nunca como 0', () => {
    render(<MensajesRecibidos estado={ok([fb, ig, { ...fbS, nuevas: null }, igS])} filtros={dos} />)
    const fila = within(screen.getByRole('table', { name: /mensajes por marca/i })).getByRole('row', { name: /Suzuki/ })
    expect(within(fila).getAllByText('—')).toHaveLength(1)
    expect(fila).not.toHaveTextContent(/\b0\b/)
  })

  it('una marca sin datos aparece igual, con guiones', () => {
    render(<MensajesRecibidos estado={ok([fb, ig])} filtros={dos} />)
    const fila = within(screen.getByRole('table', { name: /mensajes por marca/i })).getByRole('row', { name: /Suzuki/ })
    expect(fila).toHaveTextContent('—')
  })

  it('con una sola marca no hay tabla por marca', () => {
    render(<MensajesRecibidos estado={ok([fb, ig])} filtros={{ marcaIds: [MARCA], plataforma: 'todas' }} />)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('si ninguna marca tiene datos, el mensaje de siempre', () => {
    render(<MensajesRecibidos estado={ok([])} filtros={dos} />)
    expect(screen.getByText(/todavía no hay mensajes sincronizados/i)).toBeInTheDocument()
  })
})
