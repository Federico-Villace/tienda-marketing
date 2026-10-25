import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PublicidadReal } from './publicidad'
import type { CampaniaReal } from '@/lib/datos/publicidad'

const campania = (o: Partial<CampaniaReal>): CampaniaReal => ({
  id: 'u1',
  nombre: 'Tráfico web',
  cuenta: '999 MOTOS - Cuenta publicitaria',
  objetivo: 'OUTCOME_TRAFFIC',
  estado: 'ACTIVE',
  gasto: 150000,
  impresiones: 90000,
  clics: 1200,
  resultados: 30,
  dias: 30,
  ultimoDia: '2026-10-12',
  ...o,
})

const ok = (campanias: CampaniaReal[]) => ({
  tipo: 'ok' as const,
  datos: {
    campanias,
    ultimaSync: { estado: 'ok' as const, terminadaEn: '2026-10-13T09:01:00Z', error: null },
  },
})

describe('PublicidadReal', () => {
  it('muestra los totales en pesos y el costo por resultado', () => {
    render(<PublicidadReal estado={ok([campania({}), campania({ id: 'u2', gasto: 50000, resultados: 10 })])} />)
    expect(screen.getByText('Gasto', { selector: 'p' }).parentElement).toHaveTextContent(/\$\s?200\.000/)
    expect(screen.getByText('Resultados', { selector: 'p' }).parentElement).toHaveTextContent('40')
    expect(screen.getByText('Resultados', { selector: 'p' }).parentElement).toHaveTextContent(/\$\s?5\.000 por resultado/)
  })

  it('lista las campañas con su cuenta y su estado en castellano', () => {
    render(<PublicidadReal estado={ok([campania({ estado: 'PAUSED' })])} />)
    const fila = screen.getByRole('row', { name: /Tráfico web/ })
    expect(within(fila).getByText('999 MOTOS - Cuenta publicitaria')).toBeInTheDocument()
    expect(within(fila).getByText('pausada')).toBeInTheDocument()
  })

  it('dice que los datos son reales y cuándo se actualizaron', () => {
    render(<PublicidadReal estado={ok([campania({})])} />)
    expect(screen.getByText(/datos reales de meta/i)).toBeInTheDocument()
    expect(screen.getByText(/actualizado/i)).toBeInTheDocument()
  })

  it('avisa si la última sincronización tuvo errores', () => {
    const e = ok([campania({})])
    render(
      <PublicidadReal
        estado={{ ...e, datos: { ...e.datos, ultimaSync: { estado: 'error', terminadaEn: null, error: 'act_1: (#200) x' } } }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('act_1: (#200) x')
  })

  it('una sincronización parcial avisa qué cuentas fallaron sin ocultar los datos', () => {
    const e = ok([campania({})])
    render(
      <PublicidadReal
        estado={{ ...e, datos: { ...e.datos, ultimaSync: { estado: 'parcial', terminadaEn: null, error: 'act_1: (#200) x' } } }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/parcial/i)
    expect(screen.getByRole('alert')).toHaveTextContent('act_1: (#200) x')
  })

  it('sin campañas sincronizadas explica qué falta', () => {
    render(<PublicidadReal estado={{ tipo: 'ok', datos: { campanias: [], ultimaSync: null } }} />)
    expect(screen.getByText(/todavía no hay campañas/i)).toBeInTheDocument()
  })

  it('sin la base configurada no rompe el tablero', () => {
    render(<PublicidadReal estado={{ tipo: 'error', mensaje: 'Supabase 404' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Supabase 404')
  })
})

describe('PublicidadReal · atribución por marca', () => {
  const t = (campanias: number, gasto: number, resultados = 0) => ({ campanias, gasto, impresiones: 0, clics: 0, resultados })
  const atribucion = {
    porMarca: [
      { marcaId: '100206789578448', ...t(2, 50000, 5) },
      { marcaId: '1327958853726987', ...t(0, 0) },
    ],
    compartidas: 1,
    compartidasTotales: t(1, 20000, 2),
    sinAtribuir: t(3, 80000, 3),
  }

  it('sin atribución (una marca) no muestra la tabla', () => {
    render(<PublicidadReal estado={ok([campania({})])} />)
    expect(screen.queryByRole('table', { name: /atribuidas/i })).toBeNull()
  })

  it('con atribución, una fila por marca con su gasto y resultados', () => {
    render(<PublicidadReal estado={ok([campania({})])} atribucion={atribucion} />)
    const tabla = screen.getByRole('table', { name: /atribuidas por nombre/i })
    const suzuki = within(tabla).getByRole('row', { name: /Suzuki Quilmes/ })
    expect(suzuki).toHaveTextContent(/\$\s?50\.000/)
    expect(suzuki).toHaveTextContent('5')
    expect(within(tabla).getByRole('row', { name: /Zontes Quilmes/ })).toHaveTextContent(/\$\s?0/)
  })

  it('las compartidas y las sin atribuir van en filas propias, contadas una sola vez', () => {
    render(<PublicidadReal estado={ok([campania({})])} atribucion={atribucion} />)
    const tabla = screen.getByRole('table', { name: /atribuidas por nombre/i })
    expect(within(tabla).getByRole('row', { name: /compartidas/i })).toHaveTextContent(/\$\s?20\.000/)
    expect(within(tabla).getByRole('row', { name: /sin las marcas elegidas/i })).toHaveTextContent(/\$\s?80\.000/)
  })

  it('dice que es aproximado y de dónde sale', () => {
    render(<PublicidadReal estado={ok([campania({})])} atribucion={atribucion} />)
    expect(screen.getByText(/aproximad/i)).toBeInTheDocument()
    expect(screen.getByText(/nombre de la campaña/i)).toBeInTheDocument()
  })

  it('sin compartidas no muestra esa fila', () => {
    render(<PublicidadReal estado={ok([campania({})])} atribucion={{ ...atribucion, compartidas: 0, compartidasTotales: t(0, 0) }} />)
    expect(screen.queryByRole('row', { name: /compartidas/i })).toBeNull()
  })
})
