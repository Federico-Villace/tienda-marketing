import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fuente = readFileSync(join(process.cwd(), 'app/creativos/page.tsx'), 'utf8')

describe('app/creativos/page.tsx (R11)', () => {
  it('S11.7 ya no dice que confirmar no dispara ningún job', () => {
    expect(fuente).not.toMatch(/no dispara ningún job/)
    expect(fuente).not.toMatch(/Lo que todavía no existe es la\s+generación/)
  })

  it('avisa que la IA puede inventar detalles y que hay que revisar cada imagen', () => {
    expect(fuente).toMatch(/La IA puede inventar\s+detalles de la moto/)
    expect(fuente).toMatch(/revisala antes de usarla/)
  })

  it('es dinámica, lee el usuario del proxy y usa el Productor real con datos del servidor', () => {
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(fuente).toMatch(/await headers\(\)/)
    expect(fuente).toMatch(/HEADER_USUARIO/)
    expect(fuente).toContain('<Productor')
    expect(fuente).toMatch(/leerPantallaProductor/)
    expect(fuente).toMatch(/searchParams: Promise</)
  })

  it('el Productor depende de GEMINI_API_KEY y de un tope válido, no de OPENAI_API_KEY', () => {
    expect(fuente).toMatch(/GEMINI_API_KEY/)
    expect(fuente).toMatch(/leerTope\(process\.env\.PRESUPUESTO_MENSUAL_USD\)/)
    expect(fuente).not.toMatch(/OPENAI_API_KEY/)
  })

  it('nunca pasa la clave al cliente: solo el booleano o el motivo', () => {
    expect(fuente).not.toMatch(/apiKey=|GEMINI_API_KEY\}|process\.env\.GEMINI_API_KEY[^?]/)
  })

  it('tiene la sección "Tus fotos" con el componente real y los precios del servidor', () => {
    expect(fuente).toMatch(/Tus fotos/)
    expect(fuente).toContain('<Fotos')
    expect(fuente).toMatch(/menuConPrecios/)
    expect(fuente).toMatch(/pantalla\.fotos/)
  })

  it('borró el placeholder del próximo cambio: sin MENU, sin "modelo de visión" y sin motores apagados', () => {
    expect(fuente).not.toMatch(/Próximo cambio/)
    expect(fuente).not.toMatch(/productor-foto/)
    expect(fuente).not.toMatch(/modelo de visión/)
    expect(fuente).not.toMatch(/const MENU\b/)
    expect(fuente).not.toMatch(/Flux|Veo 3\.1/)
  })
})
