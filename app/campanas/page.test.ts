import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fuente = readFileSync(join(process.cwd(), 'app/campanas/page.tsx'), 'utf8')

describe('app/campanas/page.tsx (S45)', () => {
  it('ya no es una pantalla de muestra: sin aviso ni datos estáticos', () => {
    expect(fuente).not.toMatch(/Pantalla de muestra/)
    expect(fuente).not.toMatch(/const PLAN\b/)
    expect(fuente).not.toMatch(/Aviso/)
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

describe('/contenido no se toca (el Contenidista es otro cambio)', () => {
  it('conserva su aviso de pantalla de muestra', () => {
    const contenido = readFileSync(join(process.cwd(), 'app/contenido/page.tsx'), 'utf8')
    expect(contenido).toMatch(/Pantalla de muestra/)
  })
})
