import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortadaHome } from './portada'

const vacia = { placa: null, resultados: null, pendientes: 0 }

describe('PortadaHome', () => {
  it('sin placa ni resultados sigue mostrando los dos accesos', () => {
    render(<PortadaHome datos={vacia} />)
    expect(screen.getByRole('link', { name: /Armar una promoción/ }).getAttribute('href')).toBe('/promocionar/nueva')
    expect(screen.getByRole('link', { name: /Ver resultados/ }).getAttribute('href')).toBe('/tablero')
    expect(screen.queryByText(/Lo que funcionó este mes/)).toBeNull()
  })
  it('con 0 pendientes no aparece el aviso', () => {
    render(<PortadaHome datos={vacia} />)
    expect(screen.queryByText(/para terminar/)).toBeNull()
  })
  it('con pendientes, el link va a /promocionar', () => {
    render(<PortadaHome datos={{ ...vacia, pendientes: 3 }} />)
    expect(screen.getByRole('link', { name: /Tenés 3 promociones para terminar/ }).getAttribute('href')).toBe('/promocionar')
  })
})
