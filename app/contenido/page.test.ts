import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fuente = readFileSync(join(process.cwd(), 'app/contenido/page.tsx'), 'utf8')

describe('app/contenido/page.tsx (S47, S52)', () => {
  it('ya no es una pantalla de muestra: sin aviso ni datos estáticos', () => {
    expect(fuente).not.toMatch(/Pantalla de muestra/)
    expect(fuente).not.toMatch(/const PIEZAS\b/)
  })

  it('S52 avisa que no se publica nada y que imágenes y videos son fase 3', () => {
    expect(fuente).toContain('No se publica nada; las imágenes y videos son fase 3.')
  })

  it('es dinámica, lee el usuario de x-usuario-id del proxy y usa los componentes reales', () => {
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(fuente).toMatch(/await headers\(\)/)
    expect(fuente).toMatch(/HEADER_USUARIO/)
    expect(fuente).toContain('<Semana')
    expect(fuente).toMatch(/leerPiezas/)
    expect(fuente).toMatch(/leerTandas/)
  })

  it('S47 sin planes aprobados manda a /campanas, donde se aprueban', () => {
    expect(fuente).toMatch(/href="\/campanas"/)
  })

  it('solo decide qué botones se ven con el rol; el generador depende de que haya clave de OpenAI', () => {
    expect(fuente).toMatch(/puedeEditar\(/)
    expect(fuente).toMatch(/Boolean\(process\.env\.OPENAI_API_KEY\?\.trim\(\)\)/)
  })
})
