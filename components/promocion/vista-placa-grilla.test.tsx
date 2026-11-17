import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VistaPlaca } from './vista-placa'
import { textosDeGrilla } from '@/lib/promocion/varias/grilla'
import { datosDePrueba } from '@/lib/promocion/fixture'
import { MARCAS } from '@/lib/datos/marcas'
import type { TextosPlaca } from '@/lib/promocion/plantillas'
import type { MotoExtra } from '@/lib/promocion/varias/tipos'

const FUENTES = { titulo: 'Anton', texto: 'Inter' }
const textosPlaca: TextosPlaca = { marca: 'Suzuki Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '', titular: 'Elegí la tuya', extra: '', lugar: 'Quilmes' }
const extra = (n: number, o: Partial<MotoExtra> = {}): MotoExtra => ({ fotoId: `f${n}`, modelo: `LEONCINO ${n}00`, precio: { moneda: 'ARS', monto: n * 1_000_000 }, promo: { tipo: 'ninguna', detalle: '' }, ...o })
const grilla = (extras: MotoExtra[], o: { titular?: string } = {}) => ({
  textos: textosDeGrilla({ marca: 'Suzuki Quilmes', modelo: 'TRK 502', datos: datosDePrueba(), motosExtra: extras, titular: o.titular ?? 'Elegí la tuya', titularDelTexto: null, lineaExtra: null }),
  fotos: ['/f1.jpg', '/f2.jpg', null],
  marcaId: MARCAS[2]!.id,
  ocultos: [],
})
const montar = (g: ReturnType<typeof grilla>, etiqueta?: string, aspecto: '1:1' | '4:5' = '4:5') =>
  render(<VistaPlaca escenaSrc="" textos={textosPlaca} plantilla="varias_motos" aspecto={aspecto} fuentes={FUENTES} grilla={g} {...(etiqueta ? { etiqueta } : {})} />)

describe('<VistaPlaca> de la grilla de motos', () => {
  it('dibuja el modelo y el precio de CADA moto, el titular y las fotos que hay', () => {
    const { container } = montar(grilla([extra(2), extra(3)]))
    for (const x of ['TRK 502', '$ 4.500.000', 'LEONCINO 200', '$ 2.000.000', 'LEONCINO 300', '$ 3.000.000', 'Elegí la tuya']) expect(screen.getAllByText(x).length).toBeGreaterThan(0)
    const fotos = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'))
    expect(fotos).toContain('/f1.jpg')
    expect(fotos).toContain('/f2.jpg')
  })
  it('una foto que todavía no está deja un lugar vacío, sin romper', () => {
    expect(() => montar(grilla([extra(2), extra(3)]))).not.toThrow()
  })
  it('la etiqueta para quien usa lector de pantalla dice que son varias motos, no solo la primera', () => {
    montar(grilla([extra(2), extra(3)]), 'Vista previa de la grilla: TRK 502, LEONCINO 200 y LEONCINO 300')
    expect(screen.getByRole('img', { name: 'Vista previa de la grilla: TRK 502, LEONCINO 200 y LEONCINO 300' })).toBeInTheDocument()
  })
  it('un texto que no entra se muestra como aviso con la moto, no como una vista rota', () => {
    montar(grilla([extra(2, { modelo: 'M'.repeat(60) }), extra(3), extra(4)]), undefined, '1:1')
    expect(screen.getByRole('alert')).toHaveTextContent(/Moto 2/)
  })
})
