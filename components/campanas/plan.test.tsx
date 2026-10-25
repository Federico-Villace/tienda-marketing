import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { NotaMeta, PlanCampania } from './plan'
import type { PlanVista } from '@/lib/estratega/tipos'

const vista = (o: Partial<PlanVista> = {}): PlanVista => ({
  id: 'p1', raizId: 'p1', padreId: null, version: 1, origen: 'agente', estado: 'borrador',
  analisisId: 'a1', modelo: 'gpt-6-luna', costoUsd: 0.0021, creadoEn: '2026-10-20T10:00:00Z', aprobadoEn: null, desdeCache: false,
  brief: { analisisId: 'a1', objetivo: 'Vender', marcas: ['Zontes Quilmes'], producto: null, presupuestoTopeArs: 500000, desde: '2026-11-01', hasta: '2026-11-28', notas: null },
  plan: {
    objetivo: 'Subir consultas por mensaje',
    mensajeCentral: 'Probá la Zontes este mes',
    publico: { descripcion: 'Hombres de 25 a 40 de Quilmes', segmentos: [{ nombre: 'Primera moto', criterio: 'Interés en motos', porque: 'Comentan mucho' }] },
    marcas: ['Zontes Quilmes'],
    presupuesto: { montoArs: 300000, nivel: 'campania', nota: 'Sujeto a stock' },
    ventana: { desde: '2026-11-01', hasta: '2026-11-28' },
    canales: [{ plataforma: 'instagram', formatos: ['reel', 'carrusel'], porcentaje: 100, porque: 'Mejores vistas' }],
    calendario: [{ semana: 1, eje: 'Lanzamiento', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 2, idea: 'Test ride', marca: null }] }],
    kpis: [{ metrica: 'Consultas por mensaje', meta: 'Subir' }],
    fundamentos: ['"los reels rindieron 3000 vistas"'],
    supuestos: ['El stock se mantiene'],
  },
  ...o,
})

describe('PlanCampania', () => {
  it('S40: muestra objetivo, mensaje, público, canales, calendario, KPIs y fundamentos', () => {
    render(<PlanCampania vista={vista()} />)
    expect(screen.getByText('Subir consultas por mensaje')).toBeInTheDocument()
    expect(screen.getByText('Probá la Zontes este mes')).toBeInTheDocument()
    expect(screen.getByText(/Hombres de 25 a 40/)).toBeInTheDocument()
    expect(screen.getByText('Primera moto')).toBeInTheDocument()
    expect(screen.getByText('Mejores vistas')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Lanzamiento')).toBeInTheDocument()
    expect(screen.getByText(/Test ride/)).toBeInTheDocument()
    expect(screen.getByText('Consultas por mensaje')).toBeInTheDocument()
    expect(screen.getByText(/los reels rindieron 3000 vistas/)).toBeInTheDocument()
    expect(screen.getByText('El stock se mantiene')).toBeInTheDocument()
  })

  it('el presupuesto se muestra en ARS y como propuesta, con su nivel', () => {
    render(<PlanCampania vista={vista()} />)
    expect(screen.getByText('ARS 300.000')).toBeInTheDocument()
    expect(screen.getByText(/Propuesta/)).toBeInTheDocument()
    expect(screen.getByText(/campaña/i)).toBeInTheDocument()
  })

  it('con monto null dice que el presupuesto está a definir', () => {
    const v = vista()
    v.plan.presupuesto = { montoArs: null, nivel: 'a_definir', nota: null }
    render(<PlanCampania vista={v} />)
    expect(screen.getByText(/A definir/)).toBeInTheDocument()
  })

  it('S40: el costo sale en US$ con formato es-AR, y 0 en una edición', () => {
    const { rerender } = render(<PlanCampania vista={vista()} />)
    expect(screen.getByText('US$ 0,0021')).toBeInTheDocument()
    rerender(<PlanCampania vista={vista({ origen: 'edicion', costoUsd: 0, version: 2 })} />)
    expect(screen.getByText('US$ 0,0000')).toBeInTheDocument()
  })

  it('muestra el estado de la versión', () => {
    render(<PlanCampania vista={vista({ estado: 'aprobado' })} />)
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
  })
})

describe('NotaMeta (S44)', () => {
  it('dice que nada se ejecuta en Meta y que los públicos son recomendaciones', () => {
    render(<NotaMeta />)
    const nota = screen.getByRole('note')
    expect(within(nota).getByText(/no se ejecuta nada en Meta/i)).toBeInTheDocument()
    expect(within(nota).getByText(/recomendaciones/i)).toBeInTheDocument()
  })
})
