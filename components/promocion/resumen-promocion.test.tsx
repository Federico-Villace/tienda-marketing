import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResumenPromocion } from './resumen-promocion'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'
import { vistaDePromocion } from '@/lib/promocion/vista'

const fuentes = { titulo: 'Anton', texto: 'Inter' }
const promo = (o: Record<string, unknown> = {}) => vistaDePromocion(filaPromocion({ id: 'p1', copy: copyDePrueba(), copy_opcion: 1, plantilla: 'oferta_abajo', fondo: 'fondo_estudio', ...o } as never))

describe('<ResumenPromocion>', () => {
  it('con imagen y diseño muestra la placa en vivo, una sola vez, y ningún control de edición', () => {
    render(<ResumenPromocion promocion={promo()} marca="Benelli" escenaUrl="https://x/e.jpg" placaUrl={null} fuentes={fuentes} />)
    expect(screen.getAllByRole('img', { name: /Vista previa de la imagen/ })).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('con la placa final armada muestra esa imagen', () => {
    render(<ResumenPromocion promocion={promo()} marca="Benelli" escenaUrl="https://x/e.jpg" placaUrl="https://x/placa.png" fuentes={fuentes} />)
    expect(screen.getByRole('img', { name: /Imagen final de/ })).toHaveAttribute('src', 'https://x/placa.png')
    expect(screen.queryByRole('img', { name: /Vista previa de la imagen/ })).toBeNull()
  })

  it('sin imagen explica cuándo aparece la placa', () => {
    render(<ResumenPromocion promocion={promo({ plantilla: null })} marca="Benelli" escenaUrl={null} placaUrl={null} fuentes={fuentes} />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})
