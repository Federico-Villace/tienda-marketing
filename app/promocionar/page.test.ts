import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')

describe('app/promocionar/page.tsx', () => {
  const fuente = leer('app/promocionar/page.tsx')
  it('es dinámica, lee el usuario que verificó el proxy y arma la lista en el servidor', () => {
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(fuente).toMatch(/await headers\(\)/)
    expect(fuente).toMatch(/HEADER_USUARIO/)
    expect(fuente).toContain('<ListaPromociones')
    expect(fuente).toMatch(/leerListaPromociones/)
  })
  it('el botón "Nueva promoción" solo lo ve quien puede actuar', () => {
    expect(fuente).toMatch(/puedeEditar && \(\s*<Link href="\/promocionar\/nueva"/)
    expect(fuente).toContain('Nueva promoción')
  })
  it('nunca pasa claves ni el cliente de Supabase a un componente', () => {
    expect(fuente).not.toMatch(/supabase=|secretKey=|apiKey=/)
  })
})

describe('app/promocionar/nueva/page.tsx', () => {
  const fuente = leer('app/promocionar/nueva/page.tsx')
  it('muestra el stepper en el paso 1 y el formulario con las fotos del servidor', () => {
    expect(fuente).toMatch(/<Stepper visible=\{1\}/)
    expect(fuente).toContain('<PasoDatos')
    expect(fuente).toMatch(/leerFotosParaPromocion/)
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

describe('app/promocionar/[id]/page.tsx', () => {
  const fuente = leer('app/promocionar/[id]/page.tsx')
  it('params y searchParams son Promise (Next 16) y una promoción que no existe es 404', () => {
    expect(fuente).toMatch(/params: Promise</)
    expect(fuente).toMatch(/searchParams: Promise</)
    expect(fuente).toMatch(/await params/)
    expect(fuente).toMatch(/notFound\(\)/)
  })
  it('solo se mira un paso alcanzado', () => {
    expect(fuente).toMatch(/pasosAlcanzados\(promocion\)/)
    expect(fuente).toMatch(/alcanzados\.includes\(pedido\)/)
  })
  it('arma los pasos 1 a 3 con los datos del servidor y los precios aproximados', () => {
    expect(fuente).toContain('<PasoDatos')
    expect(fuente).toContain('<PasoAntecedentes')
    expect(fuente).toContain('<PasoTextos')
    expect(fuente).toMatch(/ctx\.costoAntecedentes/)
    expect(fuente).toMatch(/ctx\.costoTextos/)
  })
  it('al cliente va el booleano de la clave, nunca la clave ni el cliente de Supabase', () => {
    expect(fuente).toMatch(/habilitado=\{ctx\.openai\}/)
    expect(fuente).not.toMatch(/OPENAI_API_KEY|supabase=|secretKey=/)
  })
})
