import { describe, it, expect } from 'vitest'
import { validarPieza, validarPiezas } from './piezas'
import { contextoDePrueba, piezasDePrueba } from './fixture'
import type { Pieza } from './tipos'

const ctx = contextoDePrueba()
const agente = { origen: 'agente' } as const
const tanda = (piezas: unknown[]) => ({ piezas })
const errores = (r: { ok: boolean; errores?: string[] }) => (r.ok ? [] : r.errores!)
/** Reemplaza la pieza i de la tanda válida. */
const con = (i: number, o: Partial<Pieza>) => tanda(piezasDePrueba().map((p, j) => (j === i ? { ...p, ...o } : p)))

describe('validarPiezas: tanda válida', () => {
  it('acepta las piezas que pide la semana', () => {
    const r = validarPiezas(tanda(piezasDePrueba()), ctx, agente)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.piezas).toHaveLength(4)
  })
  it('recorta los strings', () => {
    const r = validarPiezas(con(0, { hook: '  Hola  ' }), ctx, agente)
    if (r.ok) expect(r.piezas[0]!.hook).toBe('Hola')
    else throw new Error('debía ser válida')
  })
})

describe('forma', () => {
  it('rechaza claves de más y de menos, y una raíz que no es objeto', () => {
    expect(validarPiezas([], ctx, agente).ok).toBe(false)
    expect(errores(validarPiezas(con(0, { extra: 1 } as never), ctx, agente)).join()).toContain('"piezas[0].extra" no está permitido')
    const sinHook = piezasDePrueba().map(({ hook: _h, ...r }) => r)
    expect(errores(validarPiezas(tanda(sinHook), ctx, agente)).join()).toContain('Falta el campo "piezas[0].hook"')
  })
})

describe('S14-S17 marca, plataforma, formato, fecha', () => {
  it('marca fuera del plan es inválida', () => {
    expect(validarPiezas(con(0, { marca: 'Zontes Quilmes' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { marca: 'Inventada' }), ctx, agente).ok).toBe(false)
  })
  it('plataforma y formato fuera del enum son inválidos', () => {
    expect(validarPiezas(con(0, { plataforma: 'tiktok' as never }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { formato: 'gif' as never }), ctx, agente).ok).toBe(false)
  })
  it('la fecha tiene que caer en la semana; los bordes entran', () => {
    expect(validarPiezas(con(0, { fecha: '2026-11-01' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { fecha: '2026-11-09' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { fecha: '2026-13-01' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { fecha: '2026-11-02' }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(0, { fecha: '2026-11-08' }), ctx, agente).ok).toBe(true)
  })
})

describe('S18 límites de Meta', () => {
  it('copy 2200 entra, 2201 no (contando los hashtags que se publican)', () => {
    expect(validarPiezas(con(0, { copy: 'a'.repeat(2200), hashtags: [] }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(0, { copy: 'a'.repeat(2201), hashtags: [] }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { copy: 'a'.repeat(2200), hashtags: ['#a'] }), ctx, agente).ok).toBe(false)
  })
  it('hashtags: 30 entran, 31 no; cuentan los del copy; deben empezar con #', () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => `#t${i}`)
    expect(validarPiezas(con(0, { hashtags: n(30) }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(0, { hashtags: n(31) }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { copy: 'Hola #uno #dos', hashtags: n(29) }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { hashtags: ['sinnumeral'] }), ctx, agente).ok).toBe(false)
  })
  it('menciones: hasta 20 y solo cuentas de las marcas', () => {
    const m = (k: number) => Array.from({ length: k }, () => '@999motos').join(' ')
    expect(validarPiezas(con(0, { copy: m(20) }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(0, { copy: m(21) }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { copy: 'Hola @cuenta.inventada' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { copy: 'Seguinos en @suzukiquilmescentro.' }), ctx, agente).ok).toBe(true)
  })
})

describe('S19 historia', () => {
  const historia = (o: Partial<Pieza>) => ({
    ...piezasDePrueba()[0]!, formato: 'historia' as const, guion: null, altText: null, copy: '', hashtags: [], ideaOrigen: 'Encuesta', ...o,
  })
  const ctx2 = contextoDePrueba({ semana: 2, desde: '2026-11-09', hasta: '2026-11-15' })
  const trio = (h: unknown) => tanda([h, h, h].map((x) => ({ ...(x as object), fecha: '2026-11-10' })))
  it('con copy vacío y sin hashtags es válida', () => {
    expect(validarPiezas(trio(historia({})), ctx2, agente).ok).toBe(true)
  })
  it('con copy o hashtags es inválida', () => {
    expect(validarPiezas(trio(historia({ copy: 'algo' })), ctx2, agente).ok).toBe(false)
    expect(validarPiezas(trio(historia({ hashtags: ['#a'] })), ctx2, agente).ok).toBe(false)
  })
})

describe('S20-S21 altText y guion por formato', () => {
  it('altText: obligatorio y ≤1000 en imagen; null en reel', () => {
    expect(validarPiezas(con(1, { altText: 'a'.repeat(1000) }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(1, { altText: 'a'.repeat(1001) }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(1, { altText: null }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { altText: 'no va en reel' }), ctx, agente).ok).toBe(false)
  })
  it('guion: obligatorio en reel; null en imagen', () => {
    expect(validarPiezas(con(0, { guion: null }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(1, { guion: 'no va en imagen' }), ctx, agente).ok).toBe(false)
  })
})

describe('S22 contacto', () => {
  it('email o teléfono en cualquier campo es inválido', () => {
    expect(validarPiezas(con(0, { copy: 'Escribí a ventas@999motos.com' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { cta: 'Llamá al 11 5555 1234' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { briefVisual: 'Texto: 11-5555-1234' }), ctx, agente).ok).toBe(false)
  })
  it('un precio respaldado de 8 dígitos no se confunde con un teléfono', () => {
    const c = contextoDePrueba({ fuente: 'Contado $ 12.500.000 en 12 cuotas' })
    expect(validarPiezas(con(0, { copy: 'Contado $ 12.500.000' }), c, agente).ok).toBe(true)
  })
})

describe('S23 cantidades', () => {
  it('menos, más o distinto (plataforma, formato) que lo pedido es 502', () => {
    expect(validarPiezas(tanda(piezasDePrueba().slice(0, 3)), ctx, agente).ok).toBe(false)
    expect(validarPiezas(tanda([...piezasDePrueba(), piezasDePrueba()[0]]), ctx, agente).ok).toBe(false)
    const cambiada = piezasDePrueba()
    cambiada[3] = { ...cambiada[3]!, plataforma: 'instagram' }
    expect(validarPiezas(tanda(cambiada), ctx, agente).ok).toBe(false)
  })
  it('ideaOrigen tiene que ser una idea de esa plataforma y formato', () => {
    expect(validarPiezas(con(0, { ideaOrigen: 'Otra cosa' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { ideaOrigen: 'Post de financiación' }), ctx, agente).ok).toBe(false)
  })
  it('más de 12 piezas siempre se rechaza', () => {
    const doce = Array.from({ length: 13 }, () => piezasDePrueba()[0])
    expect(validarPiezas(tanda(doce), ctx, agente).ok).toBe(false)
  })
})

describe('S24-S26 montos (solo origen agente)', () => {
  it('un monto que no está en la fuente es inválido en cada campo de texto', () => {
    expect(validarPiezas(con(0, { copy: 'Hoy $ 999.999' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { hook: '20% off' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { cta: 'En 6 cuotas' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { guion: 'Decí $5 mil' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(1, { altText: 'Cartel de $ 7.000' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { briefVisual: 'Texto en pantalla: 15%' }), ctx, agente).ok).toBe(false)
  })
  it('un monto de la fuente es válido y [precio] también', () => {
    expect(validarPiezas(con(0, { copy: 'Contado $1.500.000 en 12 cuotas' }), ctx, agente).ok).toBe(true)
    expect(validarPiezas(con(0, { copy: 'Desde [precio]' }), ctx, agente).ok).toBe(true)
  })
  it('WhatsApp solo si aparece en la fuente', () => {
    expect(validarPiezas(con(0, { cta: 'Escribinos por WhatsApp' }), ctx, agente).ok).toBe(false)
    expect(validarPiezas(con(0, { cta: 'Escribinos por WhatsApp' }), contextoDePrueba({ fuente: 'Atendemos por WhatsApp. 12 cuotas' }), agente).ok).toBe(true)
  })
})

describe('validarPieza (edición humana)', () => {
  const base = piezasDePrueba()[1]!
  const edit = { origen: 'edicion', base } as const
  it('una edición válida pasa y el humano puede escribir montos propios', () => {
    const r = validarPieza({ ...base, copy: 'Ahora $ 9.999.999 contado' }, ctx, edit)
    expect(r.ok).toBe(true)
  })
  it('sigue sujeta a los límites de Meta', () => {
    expect(validarPieza({ ...base, copy: 'a'.repeat(2201), hashtags: [] }, ctx, edit).ok).toBe(false)
    expect(validarPieza({ ...base, altText: 'a'.repeat(1001) }, ctx, edit).ok).toBe(false)
  })
  it('plataforma, formato e ideaOrigen no cambian', () => {
    expect(validarPieza({ ...base, plataforma: 'facebook' }, ctx, edit).ok).toBe(false)
    expect(validarPieza({ ...base, formato: 'carrusel' }, ctx, edit).ok).toBe(false)
    expect(validarPieza({ ...base, ideaOrigen: 'Otra' }, ctx, edit).ok).toBe(false)
  })
  it('puede cambiar la marca dentro del plan y la fecha dentro de la semana', () => {
    expect(validarPieza({ ...base, marca: 'Suzuki Quilmes', fecha: '2026-11-08' }, ctx, edit).ok).toBe(true)
    expect(validarPieza({ ...base, fecha: '2026-11-20' }, ctx, edit).ok).toBe(false)
  })
  it('los errores no llevan prefijo de ruta para campos de la raíz', () => {
    const r = validarPieza({ ...base, hook: '' }, ctx, edit)
    expect(errores(r).join()).toContain('"hook"')
  })
})
