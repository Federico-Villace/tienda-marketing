import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListaPromociones } from './lista'
import type { ItemLista } from '@/lib/promocion/pantalla'

const item = (o: Partial<ItemLista> = {}): ItemLista => ({
  id: 'p1', estado: 'borrador', marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', pasoActual: 3,
  tandaId: null, actualizadoEn: '2026-10-25T15:00:00+00:00', miniatura: 'https://x/foto.jpg', descarga: null, ...o,
})

describe('<ListaPromociones>', () => {
  it('sin nada lo dice y deja empezar', () => {
    render(<ListaPromociones borradores={[]} aprobadas={[]} />)
    expect(screen.getByText(/Todavía no armaste ninguna promoción/)).toBeInTheDocument()
  })

  it('un borrador dice en qué paso quedó y lleva a ese paso', () => {
    render(<ListaPromociones borradores={[item()]} aprobadas={[]} />)
    expect(screen.getByRole('heading', { name: 'En preparación' })).toBeInTheDocument()
    expect(screen.getByText('TRK 502')).toBeInTheDocument()
    expect(screen.getByText('$ 4.500.000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Seguir en el paso 3/ })).toHaveAttribute('href', '/promocionar/p1?paso=3')
  })

  it('una aprobada muestra la placa, se puede abrir y descargar', () => {
    render(<ListaPromociones borradores={[]} aprobadas={[item({ id: 'p2', estado: 'aprobada', pasoActual: 6, miniatura: 'https://x/placa.png', descarga: 'https://x/placa.png?download=trk.png' })]} />)
    expect(screen.getByRole('heading', { name: 'Aprobadas' })).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/placa.png')
    expect(screen.getByRole('link', { name: /Descargar imagen/ })).toHaveAttribute('href', 'https://x/placa.png?download=trk.png')
    expect(screen.getByRole('link', { name: /Ver/ })).toHaveAttribute('href', '/promocionar/p2?paso=6')
  })

  it('sin URL de descarga no inventa el botón', () => {
    render(<ListaPromociones borradores={[]} aprobadas={[item({ estado: 'aprobada', pasoActual: 6, descarga: null })]} />)
    expect(screen.queryByRole('link', { name: /Descargar imagen/ })).toBeNull()
  })

  it('solo mira: el lector ve la lista pero ningún link lo lleva a editar', () => {
    render(<ListaPromociones borradores={[item()]} aprobadas={[]} soloVer />)
    expect(screen.queryByRole('link', { name: /Seguir en el paso/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Ver/ })).toBeInTheDocument()
  })
})

describe('<ListaPromociones> · tandas', () => {
  it('las hijas de una tanda van juntas bajo un título con progreso y link principal a la tanda; las sueltas aparte', () => {
    render(
      <ListaPromociones
        borradores={[item({ id: 'h1', tandaId: 'T1', marca: 'Zontes Quilmes' }), item({ id: 'suelta', modelo: 'Otra' }), item({ id: 'h2', tandaId: 'T1', marca: 'Suzuki Quilmes' })]}
        aprobadas={[]}
      />,
    )
    const grupo = screen.getByRole('group', { name: /Tanda · TRK 502 · 2 marcas/ })
    expect(grupo).toHaveTextContent('TRK 502 · 2 marcas · 0 de 2 aprobadas')
    expect(screen.getByRole('link', { name: 'Seguir con la tanda' })).toHaveAttribute('href', '/promocionar/tanda/T1')
    expect(grupo).toHaveTextContent('Textos, imagen y aprobación para todas las marcas juntas.')
    expect(grupo).toHaveTextContent('Zontes Quilmes')
    expect(grupo).toHaveTextContent('Suzuki Quilmes')
    expect(grupo).not.toHaveTextContent('Otra')
    expect(screen.getByText('Otra')).toBeInTheDocument()
  })

  it('una hija sola de su tanda igual se muestra agrupada', () => {
    render(<ListaPromociones borradores={[item({ tandaId: 'T1' })]} aprobadas={[]} />)
    expect(screen.getByRole('group', { name: /Tanda/ })).toBeInTheDocument()
  })

  it('una tanda con hijas en borrador y aprobadas se muestra UNA vez, en preparación, con su progreso', () => {
    render(
      <ListaPromociones
        borradores={[item({ id: 'h1', tandaId: 'T1', modelo: 'Rouser 200', marca: 'A', pasoActual: 3 }), item({ id: 'h2', tandaId: 'T1', modelo: 'Rouser 200', marca: 'B', pasoActual: 4 })]}
        aprobadas={[item({ id: 'h3', tandaId: 'T1', modelo: 'Rouser 200', marca: 'C', estado: 'aprobada', pasoActual: 6, descarga: 'https://x/c.png' })]}
      />,
    )
    const grupos = screen.getAllByRole('group')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toHaveTextContent('Rouser 200 · 3 marcas · 1 de 3 aprobadas')
    expect(screen.queryByRole('heading', { name: 'Aprobadas' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Seguir con la tanda' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /Seguir en el paso/ })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Retocar solo esta' })).toHaveLength(2)
    expect(grupos[0]).toHaveTextContent('En el paso 3')
    expect(grupos[0]).toHaveTextContent('En el paso 4')
    expect(grupos[0]).toHaveTextContent('Aprobada')
    expect(screen.getByRole('link', { name: /Descargar imagen/ })).toHaveAttribute('href', 'https://x/c.png')
  })

  it('una tanda con todas aprobadas va en Aprobadas', () => {
    render(
      <ListaPromociones
        borradores={[]}
        aprobadas={[item({ id: 'h1', tandaId: 'T1', estado: 'aprobada', pasoActual: 6 }), item({ id: 'h2', tandaId: 'T1', estado: 'aprobada', pasoActual: 6 })]}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'En preparación' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Aprobadas' })).toBeInTheDocument()
    expect(screen.getByRole('group')).toHaveTextContent('TRK 502 · 2 marcas · 2 de 2 aprobadas')
    expect(screen.queryByRole('link', { name: 'Retocar solo esta' })).toBeNull()
  })

  it('solo mira: la tanda se puede ver pero no hay links de edición', () => {
    render(<ListaPromociones borradores={[item({ tandaId: 'T1' })]} aprobadas={[]} soloVer />)
    expect(screen.queryByRole('link', { name: 'Seguir con la tanda' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Retocar solo esta' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver la tanda' })).toHaveAttribute('href', '/promocionar/tanda/T1')
  })
})
