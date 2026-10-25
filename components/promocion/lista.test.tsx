import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListaPromociones } from './lista'
import type { ItemLista } from '@/lib/promocion/pantalla'

const item = (o: Partial<ItemLista> = {}): ItemLista => ({
  id: 'p1', estado: 'borrador', marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', pasoActual: 3,
  actualizadoEn: '2026-10-25T15:00:00+00:00', miniatura: 'https://x/foto.jpg', descarga: null, ...o,
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
