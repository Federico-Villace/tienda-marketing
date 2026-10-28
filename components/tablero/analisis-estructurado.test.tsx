import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AnalisisEstructurado } from './analisis-estructurado'
import { enriquecer } from '@/lib/analista/estructurado'
import { armarEntrada } from '@/lib/analista/entrada'
import { aCampaniaFila, aPostFila } from '@/lib/analista/origen'
import { campania, filtrosZontes, post } from '@/lib/analista/fixture.test-util'

const publicaciones = Array.from({ length: 6 }, () => post())
const campanias = [campania({ resultados: 10 })]
const entrada = armarEntrada({ filtros: filtrosZontes, publicaciones, campanias, mensajes: [] })
const vistas = entrada.hechos.find((h) => h.que === 'Vistas totales')!

const analisis = enriquecer(
  { resumen: 'Resumen', hace: [{ accion: 'Repetí los reels', porque: 'Funcionan', hechos: [vistas.id] }], evita: [], proba: [], ideas: [] },
  entrada,
)
const origen = { publicaciones: publicaciones.map(aPostFila), campanias: campanias.map(aCampaniaFila) }

describe('AnalisisEstructurado · datos de origen', () => {
  it('con origen, el dato se despliega y lista las publicaciones con su link', () => {
    render(<AnalisisEstructurado a={analisis} puedeArmar={false} origen={origen} />)
    const detalle = screen.getByText(/ver cuáles/i).closest('details')!
    expect(detalle.open).toBe(false)
    const tabla = within(detalle).getByRole('table')
    expect(within(tabla).getAllByRole('link')).toHaveLength(6)
  })

  it('sin origen, el dato es solo el número (nada que desplegar)', () => {
    render(<AnalisisEstructurado a={analisis} puedeArmar={false} />)
    expect(screen.queryByText(/ver cuáles/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Vistas totales/)).toBeInTheDocument()
  })

  it('si lo que hay en pantalla no suma la muestra del dato, no se ofrece desplegarlo', () => {
    render(<AnalisisEstructurado a={analisis} puedeArmar={false} origen={{ ...origen, publicaciones: origen.publicaciones.slice(0, 3) }} />)
    expect(screen.queryByText(/ver cuáles/i)).not.toBeInTheDocument()
  })
})
