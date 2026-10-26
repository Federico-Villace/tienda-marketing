import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fuente = readFileSync(join(process.cwd(), 'app/campanas/page.tsx'), 'utf8')

describe('app/campanas/page.tsx (S45)', () => {
  it('ya no es una pantalla de muestra: sin aviso ni datos estáticos', () => {
    expect(fuente).not.toMatch(/Pantalla de muestra/)
    expect(fuente).not.toMatch(/const PLAN\b/)
    expect(fuente).not.toMatch(/Pantalla de muestra|aviso de muestra/i)
  })

  it('es dinámica, lee el usuario de x-usuario-id del proxy y usa los componentes reales', () => {
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(fuente).toMatch(/await headers\(\)/)
    expect(fuente).toMatch(/HEADER_USUARIO/)
    for (const c of ['FormularioBrief', 'PlanCampania', 'Acciones', 'Versiones', 'NotaMeta']) {
      expect(fuente).toContain(c)
    }
  })

  it('el formulario solo se ofrece a quien puede editar (director/operador)', () => {
    expect(fuente).toMatch(/puedeEditar/)
  })
})

describe('app/campanas/page.tsx (ADR-028)', () => {
  it('lee ?analisis= y ?marca= (repetida) para abrir el brief ya armado', () => {
    expect(fuente).toMatch(/analisis\?: string; marca\?: string \| string\[\]/)
    expect(fuente).toMatch(/marcasDeUrl\(consulta\.marca\)/)
    expect(fuente).toMatch(/analisisInicial=\{consulta\.analisis\}/)
    expect(fuente).toMatch(/marcasIniciales=/)
  })

  it('cada análisis ofrece sus marcas para preseleccionar', () => {
    expect(fuente).toMatch(/marcaIdsDeAnalisis\(a\)/)
  })
})
