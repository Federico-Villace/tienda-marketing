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

  it('es dinámica, lee el usuario del proxy y usa el flujo Crear imagen con datos del servidor', () => {
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(fuente).toMatch(/await headers\(\)/)
    expect(fuente).toMatch(/HEADER_USUARIO/)
    expect(fuente).toContain('<CrearImagen')
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

  it('un solo flujo: Crear imagen recibe piezas, fotos y los precios del servidor; no quedan Productor ni Tus fotos', () => {
    expect(fuente).toContain('<CrearImagen')
    expect(fuente).toMatch(/menuConPrecios/)
    expect(fuente).toMatch(/pantalla\.fotos/)
    expect(fuente).toMatch(/pantalla\.piezas/)
    expect(fuente).not.toContain('<Productor')
    expect(fuente).not.toContain('<Fotos')
    expect(fuente).not.toMatch(/Tus fotos/)
  })

  it('una sola galería "Imágenes generadas" con las piezas y las fotos', () => {
    expect(fuente).toMatch(/Imágenes generadas/)
    expect(fuente).toContain('<GaleriaImagenes')
    expect((fuente.match(/<GaleriaImagenes/g) ?? []).length).toBe(1)
  })

  it('el simulador de costos sale del flujo: va en un <details> colapsado al final', () => {
    expect(fuente).toMatch(/<details[^>]*>\s*<summary[^>]*>\s*¿Cuánto cuesta cada opción\?/)
    expect(fuente).not.toMatch(/<details[^>]*\bopen\b/)
    expect(fuente.indexOf('<Compuerta')).toBeGreaterThan(fuente.indexOf('<GaleriaImagenes'))
  })

  it('cuando está apagado lo explica en castellano, sin nombres de variables de entorno', () => {
    expect(fuente).not.toMatch(/'[^'\n]*(GEMINI_API_KEY|PRESUPUESTO_MENSUAL_USD)[^'\n]*'/)
    expect(fuente).toMatch(/falta la clave de Gemini/)
    expect(fuente).toMatch(/falta definir el tope de gasto mensual/)
  })

  it('borró el placeholder del próximo cambio: sin MENU, sin "modelo de visión" y sin motores apagados', () => {
    expect(fuente).not.toMatch(/Próximo cambio/)
    expect(fuente).not.toMatch(/productor-foto/)
    expect(fuente).not.toMatch(/modelo de visión/)
    expect(fuente).not.toMatch(/const MENU\b/)
    expect(fuente).not.toMatch(/Flux|Veo 3\.1/)
  })
})
