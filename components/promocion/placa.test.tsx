import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Placa } from './placa'
import { ajustarTextos, type TextosPlaca } from '@/lib/promocion/plantillas'
import type { IdPlantilla } from '@/lib/promocion/tipos'
import type { AspectoFoto } from '@/lib/productor/ediciones'

const textos: TextosPlaca = {
  marca: 'Benelli Store Quilmes',
  modelo: 'TRK 502',
  precio: '$ 4.500.000',
  promo: '12 cuotas sin interés',
  titular: 'Tu próxima aventura',
  lugar: 'Quilmes',
}
const fuentes = { titulo: 'Anton', texto: 'Inter' }
const montar = (o: { textos?: TextosPlaca; plantilla?: IdPlantilla; aspecto?: AspectoFoto } = {}) => {
  const t = o.textos ?? textos
  const plantilla = o.plantilla ?? 'oferta_abajo'
  const aspecto = o.aspecto ?? '4:5'
  return render(<Placa escenaSrc="data:image/jpeg;base64,AAAA" textos={t} plantilla={plantilla} aspecto={aspecto} ajuste={ajustarTextos(t, plantilla, aspecto)} fuentes={fuentes} />)
}

describe('<Placa>', () => {
  it('escribe el precio EXACTO tal cual lo recibe: la IA no lo toca', () => {
    montar()
    expect(screen.getByText('$ 4.500.000')).toBeInTheDocument()
  })

  it('muestra marca, modelo, promoción, titular y lugar', () => {
    montar()
    for (const t of ['Benelli Store Quilmes', 'TRK 502', '12 cuotas sin interés', 'Tu próxima aventura', 'Quilmes']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
  })

  it('sin promoción no deja un renglón vacío', () => {
    const { container } = montar({ textos: { ...textos, promo: '' } })
    expect(screen.queryByText('12 cuotas sin interés')).toBeNull()
    expect(container.querySelectorAll('div:empty').length).toBeLessThanOrEqual(1) // solo el fondo del degradé
  })

  it('compatible con satori: sin clases, solo flex y ninguna grilla', () => {
    const { container } = montar()
    expect(container.querySelectorAll('[class]')).toHaveLength(0)
    const divs = [...container.querySelectorAll('div')]
    expect(divs.length).toBeGreaterThan(3)
    for (const d of divs) expect((d as HTMLElement).style.display, d.outerHTML.slice(0, 80)).toBe('flex')
    expect(container.innerHTML).not.toMatch(/grid/)
  })

  it('la foto de fondo cubre todo el cuadro', () => {
    const { container } = montar()
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA')
    expect(img.style.objectFit).toBe('cover')
    expect(img.style.width).toBe('1080px')
    expect(img.style.height).toBe('1350px')
  })

  it('mide lo que dice el formato', () => {
    for (const [aspecto, alto] of [['1:1', 1080], ['4:5', 1350], ['9:16', 1920]] as const) {
      const { container, unmount } = montar({ aspecto })
      const raiz = container.firstElementChild as HTMLElement
      expect(raiz.style.width).toBe('1080px')
      expect(raiz.style.height).toBe(`${alto}px`)
      unmount()
    }
  })

  it('"abajo" pega el texto al borde inferior y "arriba" al superior', () => {
    const abajo = montar({ plantilla: 'oferta_abajo' })
    expect(abajo.container.innerHTML).toMatch(/bottom: 0px/)
    abajo.unmount()
    const arriba = montar({ plantilla: 'oferta_arriba' })
    expect(arriba.container.innerHTML).toMatch(/top: 0px/)
    expect(arriba.container.innerHTML).not.toMatch(/bottom: 0px/)
  })

  it('siempre hay un fondo opaco detrás del texto (no se confía en la zona libre de la IA)', () => {
    for (const plantilla of ['oferta_abajo', 'oferta_arriba', 'catalogo'] as const) {
      const { container, unmount } = montar({ plantilla })
      expect(container.innerHTML, plantilla).toMatch(/linear-gradient|rgba\(1?\d, ?1?\d, ?1?\d, ?0\.9/)
      unmount()
    }
  })

  it('el precio y el modelo van en la fuente de títulos; el resto en la de texto', () => {
    const { container } = montar()
    const de = (t: string) => (screen.getByText(t) as HTMLElement).style.fontFamily
    expect(de('$ 4.500.000')).toBe('Anton')
    expect(de('TRK 502')).toBe('Anton')
    expect(de('Tu próxima aventura')).toBe('Inter')
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('el tamaño de la letra sale del ajuste', () => {
    montar()
    const aj = ajustarTextos(textos, 'oferta_abajo', '4:5')
    expect((screen.getByText('$ 4.500.000') as HTMLElement).style.fontSize).toBe(`${aj.precio.tam}px`)
  })

  it('no pone emojis ni nada que satori tenga que bajar de la red', () => {
    const { container } = montar()
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
