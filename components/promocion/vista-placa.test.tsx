import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VistaPlaca } from './vista-placa'
import type { TextosPlaca } from '@/lib/promocion/plantillas'

const textos: TextosPlaca = { marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes' }
const fuentes = { titulo: 'Anton', texto: 'Inter' }
afterEach(() => vi.unstubAllGlobals())

describe('<VistaPlaca>', () => {
  it('es una imagen con una descripción que dice el modelo y el precio', () => {
    render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={textos} plantilla="oferta_abajo" aspecto="4:5" fuentes={fuentes} />)
    expect(screen.getByRole('img', { name: /Vista previa.*TRK 502.*\$ 4\.500\.000/ })).toBeInTheDocument()
  })

  it('dibuja la placa de verdad: el precio está en el cuadro', () => {
    const { container } = render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={textos} plantilla="oferta_abajo" aspecto="4:5" fuentes={fuentes} />)
    expect(container.textContent).toContain('$ 4.500.000')
  })

  it('guarda la proporción del formato elegido', () => {
    const { container } = render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={textos} plantilla="oferta_abajo" aspecto="9:16" fuentes={fuentes} />)
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('1080 / 1920')
  })

  it('si un texto no entra en el diseño lo dice en castellano en vez de romper', () => {
    render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={{ ...textos, modelo: 'm'.repeat(60) }} plantilla="oferta_abajo" aspecto="4:5" fuentes={fuentes} />)
    expect(screen.getByRole('alert')).toHaveTextContent('El texto del modelo es muy largo para este diseño.')
  })

  it('sin ResizeObserver (o con él) no falla y arranca con una escala usable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { container } = render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={textos} plantilla="catalogo" aspecto="1:1" fuentes={fuentes} />)
    expect(container.querySelector('[style*="scale("]')).not.toBeNull()
  })

  it('una miniatura se esconde para el lector de pantalla', () => {
    const { container } = render(<VistaPlaca escenaSrc="https://x/e.jpg" textos={textos} plantilla="catalogo" aspecto="1:1" fuentes={fuentes} decorativa />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
