import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fuente = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')

describe('app/page.tsx (inicio)', () => {
  it('la acción principal es armar una promoción paso a paso', () => {
    expect(fuente).toMatch(/href="\/promocionar"/)
    expect(fuente).toContain('Armar una promoción paso a paso')
  })
  it('el botón principal viene antes que la lista de agentes', () => {
    expect(fuente.indexOf('href="/promocionar"')).toBeLessThan(fuente.indexOf('El equipo'))
  })
  it('sigue mostrando los agentes por separado', () => {
    for (const a of ['Analista', 'Estratega', 'Contenidista', 'Productor']) expect(fuente).toContain(a)
  })
})
