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
  it('arma los pasos 4 a 6 con la imagen, la aprobación y el resultado', () => {
    expect(fuente).toContain('<PasoPlaca')
    expect(fuente).toContain('<PasoAprobar')
    expect(fuente).toContain('<PasoFinal')
    expect(fuente).not.toMatch(/llega en el próximo cambio/)
  })
  it('la imagen gasta dólares: va el motivo por el que está apagada, nunca la clave de Gemini', () => {
    expect(fuente).toMatch(/apagado=\{ctx\.imagen\.apagado\}/)
    expect(fuente).not.toMatch(/GEMINI_API_KEY/)
  })
  it('carga las dos fuentes de la placa para que la vista previa se parezca al PNG final', () => {
    expect(fuente).toMatch(/anton\.variable/)
    expect(fuente).toMatch(/inter\.variable/)
    expect(fuente).toMatch(/fuentes=\{FUENTES_NAVEGADOR\}/)
  })
  it('al cliente va el booleano de la clave, nunca la clave ni el cliente de Supabase', () => {
    expect(fuente).toMatch(/habilitado=\{ctx\.openai\}/)
    expect(fuente).not.toMatch(/OPENAI_API_KEY|supabase=|secretKey=/)
  })
})

describe('app/promocionar/tanda/[id]/page.tsx (ADR-028)', () => {
  const fuente = leer('app/promocionar/tanda/[id]/page.tsx')
  it('params y searchParams son Promise (Next 16), es dinámica y una tanda inexistente es 404', () => {
    expect(fuente).toMatch(/params: Promise</)
    expect(fuente).toMatch(/searchParams: Promise</)
    expect(fuente).toMatch(/await params/)
    expect(fuente).toMatch(/notFound\(\)/)
    expect(fuente).toMatch(/export const dynamic = 'force-dynamic'/)
  })
  it('arma la comparación gratis (RPC de lectura) y la tanda con los costos unitarios para el total del lote', () => {
    expect(fuente).toContain('<ComparacionMarcas')
    expect(fuente).toMatch(/leerComparacionPromocion/)
    expect(fuente).toContain('<Tanda')
    expect(fuente).toMatch(/costoAntecedentesUsd=\{ctx\.costoAntecedentesUsd\}/)
    expect(fuente).toMatch(/apagado=\{ctx\.imagen\.apagado\}/)
  })
  it('al cliente va el booleano de la clave, nunca la clave ni el cliente de Supabase', () => {
    expect(fuente).toMatch(/habilitado=\{ctx\.openai\}/)
    expect(fuente).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|supabase=|secretKey=/)
  })
})

describe('app/promocionar/[id]/page.tsx · hija de una tanda', () => {
  const fuente = leer('app/promocionar/[id]/page.tsx')
  it('avisa que es parte de una tanda y deja volver', () => {
    expect(fuente).toMatch(/detalle\.tanda &&/)
    expect(fuente).toContain('Volver a la tanda')
    expect(fuente).toMatch(/\/promocionar\/tanda\/\$\{detalle\.tanda\.id\}/)
  })
})

describe('aviso único de solo lectura (ADR-029)', () => {
  it.each(['app/promocionar/page.tsx', 'app/promocionar/nueva/page.tsx', 'app/promocionar/[id]/page.tsx', 'app/promocionar/tanda/[id]/page.tsx', 'app/tablero/page.tsx', 'app/campanas/page.tsx', 'app/contenido/page.tsx'])('%s muestra <AvisoSoloVer /> al lector', (ruta) => {
    expect(leer(ruta)).toContain('<AvisoSoloVer />')
  })
})
