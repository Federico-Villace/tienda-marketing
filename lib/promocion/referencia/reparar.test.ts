import { describe, it, expect } from 'vitest'
import { repararPlantilla, MINIMOS, MARGEN_X, MARGEN_Y, ANCHO_REF } from './reparar'
import { leerLectura } from './esquema'
import { ratioContraste } from './contraste'
import { interseca } from './geometria'
import { FUENTES_POR_ROL } from '../fuentes-placa'
import { INCLINACIONES } from '../diseno/tipos'
import type { CajaPx, CajaRel, LecturaCruda, PlantillaReferencia, ZonaCruda } from './tipos'

const REF = { anchoRef: 1080, altoRef: 1350 }
const z = (caja: CajaRel, o: Partial<ZonaCruda> = {}): ZonaCruda => ({ caja, color: null, fuente: null, alineacion: null, inclinacion: null, mayusculas: null, estilo: null, relleno: null, ...o })
const lectura = (o: Partial<LecturaCruda['zonas']> & { fondo?: Partial<LecturaCruda['fondo']>; utilizable?: boolean; motivo?: LecturaCruda['motivo']; acento?: string | null } = {}): LecturaCruda => ({
  utilizable: o.utilizable ?? true,
  motivo: o.motivo ?? 'ok',
  fondo: { tipo: 'liso', color: '#0B0B0D', color2: null, direccion: null, ...o.fondo },
  acento: o.acento === undefined ? '#E4FF1A' : o.acento,
  zonas: {
    moto: z({ x: 0.1, y: 0.3, w: 0.8, h: 0.4 }),
    modelo: z({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#FFFFFF', fuente: 'condensada', mayusculas: true, alineacion: 'izquierda', inclinacion: 0 }),
    precio: z({ x: 0.05, y: 0.8, w: 0.5, h: 0.08 }, { color: '#FFFFFF', fuente: 'gruesa', alineacion: 'centro', estilo: 'texto' }),
    condicion: z({ x: 0.58, y: 0.8, w: 0.37, h: 0.08 }, { color: '#FFFFFF', fuente: 'condensada', alineacion: 'derecha' }),
    frase: z({ x: 0.05, y: 0.21, w: 0.5, h: 0.07 }, { color: '#FFFFFF', fuente: 'manuscrita', alineacion: 'izquierda', inclinacion: -6 }),
    cta: z({ x: 0.05, y: 0.9, w: 0.4, h: 0.04 }, { color: '#FFFFFF', relleno: '#E11D2E' }),
    logos: [{ x: 0.05, y: 0.02, w: 0.2, h: 0.05 }],
    ...o,
  } as LecturaCruda['zonas'],
})

function ok(l: LecturaCruda, ref = REF) {
  const r = repararPlantilla(l, ref)
  if (!r.ok) throw new Error(`inutilizable: ${r.motivo}`)
  return r
}

const cajasDe = (p: PlantillaReferencia): { nombre: string; caja: CajaPx }[] => [
  { nombre: 'moto', caja: p.moto },
  { nombre: 'modelo', caja: p.modelo.caja },
  { nombre: 'precio', caja: p.precio.caja },
  ...(p.condicion ? [{ nombre: 'condicion', caja: p.condicion.caja }] : []),
  ...(p.frase ? [{ nombre: 'frase', caja: p.frase.caja }] : []),
  ...(p.cta ? [{ nombre: 'cta', caja: p.cta.caja }] : []),
  ...p.logos.map((caja, i) => ({ nombre: `logo${i}`, caja })),
]

/** Todo lo que tiene que valer SIEMPRE para una plantilla reparada. */
function invariantes(p: PlantillaReferencia) {
  const W = p.ancho
  const H = p.alto
  expect(W).toBe(ANCHO_REF)
  const todas = cajasDe(p)
  for (const { nombre, caja } of todas) {
    for (const v of [caja.x, caja.y, caja.w, caja.h]) expect(Number.isInteger(v), `${nombre} entero`).toBe(true)
    if (nombre === 'moto') {
      expect(caja.x, 'moto x').toBeGreaterThanOrEqual(0)
      expect(caja.y, 'moto y').toBeGreaterThanOrEqual(0)
      expect(caja.x + caja.w, 'moto der').toBeLessThanOrEqual(W)
      expect(caja.y + caja.h, 'moto abajo').toBeLessThanOrEqual(H)
    } else {
      expect(caja.x, `${nombre} x`).toBeGreaterThanOrEqual(MARGEN_X)
      expect(caja.y, `${nombre} y`).toBeGreaterThanOrEqual(MARGEN_Y)
      expect(caja.x + caja.w, `${nombre} der`).toBeLessThanOrEqual(W - MARGEN_X)
      expect(caja.y + caja.h, `${nombre} abajo`).toBeLessThanOrEqual(H - MARGEN_Y)
    }
  }
  for (let i = 0; i < todas.length; i++) for (let j = i + 1; j < todas.length; j++) expect(interseca(todas[i]!.caja, todas[j]!.caja), `${todas[i]!.nombre} pisa a ${todas[j]!.nombre}`).toBe(false)
  const m = (c: CajaPx, min: { w: number; h: number }, n: string) => {
    expect(c.w, `${n} ancho mínimo`).toBeGreaterThanOrEqual(min.w)
    expect(c.h, `${n} alto mínimo`).toBeGreaterThanOrEqual(min.h)
  }
  expect(p.moto.w).toBeGreaterThanOrEqual(Math.floor(W * 0.45))
  expect(p.moto.h).toBeGreaterThanOrEqual(Math.floor(H * 0.25))
  expect(p.moto.w * p.moto.h).toBeLessThanOrEqual(W * H * 0.75 + 1)
  m(p.modelo.caja, MINIMOS.modelo, 'modelo')
  m(p.precio.caja, MINIMOS.precio, 'precio')
  if (p.condicion) m(p.condicion.caja, MINIMOS.condicion, 'condicion')
  if (p.frase) m(p.frase.caja, MINIMOS.frase, 'frase')
  if (p.cta) m(p.cta.caja, MINIMOS.cta, 'cta')
  for (const l of p.logos) m(l, MINIMOS.logo, 'logo')
  expect(p.logos.length).toBeLessThanOrEqual(2)
  for (const c of [p.acento, p.fondo.color, p.modelo.color, p.precio.color]) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  expect(FUENTES_POR_ROL.modelo).toContain(p.modelo.fuente)
  expect(FUENTES_POR_ROL.precio).toContain(p.precio.fuente)
  if (p.frase) expect(FUENTES_POR_ROL.frase).toContain(p.frase.fuente)
  for (const g of [p.modelo.inclinacion, ...(p.frase ? [p.frase.inclinacion] : [])]) expect(INCLINACIONES as readonly number[]).toContain(g)
  expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(4096)
}

describe('repararPlantilla · camino feliz', () => {
  it('una lectura limpia da una plantilla válida con el alto de la referencia', () => {
    const r = ok(lectura())
    invariantes(r.plantilla)
    expect(r.plantilla.alto).toBe(1350)
    expect(r.plantilla.moto).toEqual({ x: 108, y: 405, w: 864, h: 540 })
  })
  it('el alto sale de las medidas de la foto, no del modelo', () => {
    expect(ok(lectura(), { anchoRef: 1080, altoRef: 1080 }).plantilla.alto).toBe(1080)
    expect(ok(lectura(), { anchoRef: 1000, altoRef: 1778 }).plantilla.alto).toBe(1920)
    expect(ok(lectura(), { anchoRef: 2048, altoRef: 1536 }).plantilla.alto).toBe(810)
  })
  it('es pura: no muta la entrada y repite el resultado', () => {
    const l = lectura()
    const copia = JSON.parse(JSON.stringify(l))
    const a = repararPlantilla(l, REF)
    expect(l).toEqual(copia)
    expect(repararPlantilla(l, REF)).toEqual(a)
  })
  it('lo opcional que falta queda en null / vacío, sin inventarlo', () => {
    const r = ok(lectura({ condicion: null, frase: null, cta: null, logos: [] }))
    expect(r.plantilla.condicion).toBeNull()
    expect(r.plantilla.frase).toBeNull()
    expect(r.plantilla.cta).toBeNull()
    expect(r.plantilla.logos).toEqual([])
    invariantes(r.plantilla)
  })
})

describe('repararPlantilla · inutilizable y fallback', () => {
  it('"utilizable: false" propaga el motivo', () => {
    const r = repararPlantilla(lectura({ utilizable: false, motivo: 'muy_cargada' }), REF)
    expect(r).toMatchObject({ ok: false, motivo: 'muy_cargada' })
  })
  it('sin moto → sin_moto; sin modelo o sin precio → sin_zonas', () => {
    expect(repararPlantilla(lectura({ moto: null }), REF)).toMatchObject({ ok: false, motivo: 'sin_moto' })
    expect(repararPlantilla(lectura({ modelo: null }), REF)).toMatchObject({ ok: false, motivo: 'sin_zonas' })
    expect(repararPlantilla(lectura({ precio: null }), REF)).toMatchObject({ ok: false, motivo: 'sin_zonas' })
  })
  it('una caja obligatoria sin área (fuera de la imagen o de ancho 0) cuenta como faltante', () => {
    expect(repararPlantilla(lectura({ precio: z({ x: 2, y: 0.8, w: 0.3, h: 0.1 }) }), REF)).toMatchObject({ ok: false, motivo: 'sin_zonas' })
    expect(repararPlantilla(lectura({ modelo: z({ x: 0.1, y: 0.1, w: 0, h: 0.1 }) }), REF)).toMatchObject({ ok: false, motivo: 'sin_zonas' })
    expect(repararPlantilla(lectura({ moto: z({ x: 5, y: 0.3, w: 1, h: 0.4 }) }), REF)).toMatchObject({ ok: false, motivo: 'sin_moto' })
  })
  it.each([[0, 1350], [1080, 0], [NaN, 1350], [1080, Infinity], [-1, 5], [1080, 100000], [100000, 1080]])('medidas inválidas (%s×%s) → formato_invalido', (a, h) => {
    expect(repararPlantilla(lectura(), { anchoRef: a, altoRef: h })).toMatchObject({ ok: false, motivo: 'formato_invalido' })
  })
  it('si no hay lugar para el precio y el modelo juntos → sin_espacio', () => {
    // Imagen muy apaisada (2048×512 → 1080×270): la moto exige el 25 % y no queda alto para dos textos obligatorios.
    const r = repararPlantilla(lectura({ moto: z({ x: 0.1, y: 0.2, w: 0.8, h: 0.6 }), modelo: z({ x: 0.05, y: 0.05, w: 0.9, h: 0.1 }), precio: z({ x: 0.05, y: 0.85, w: 0.9, h: 0.1 }) }), { anchoRef: 2048, altoRef: 512 })
    expect(r).toMatchObject({ ok: false, motivo: 'sin_espacio' })
  })

  const fondo = (color: string | null, acento: string | null = null) => repararPlantilla(lectura({ utilizable: false, motivo: 'no_es_placa', fondo: { color }, acento }), REF)
  it('el fallback sigue el tono del fondo: oscuro → impactante, azul saturado → deportiva, claro → editorial', () => {
    expect(fondo('#0B0B0D')).toMatchObject({ fallback: 'impactante_textura' })
    expect(fondo('#1530C8')).toMatchObject({ fallback: 'deportiva' })
    expect(fondo('#F3EBDD')).toMatchObject({ fallback: 'editorial' })
  })
  it('sin color de fondo usa la impactante', () => {
    expect(fondo(null)).toMatchObject({ fallback: 'impactante_textura' })
  })
  it('elige el acento más cercano al leído dentro de la paleta del fallback', () => {
    expect(fondo('#0B0B0D', '#FF5A00')).toMatchObject({ fallback: 'impactante_textura', acento: 'naranja' })
    expect(fondo('#0B0B0D', '#00FF55')).toMatchObject({ acento: 'verde' })
    expect(fondo('#F3EBDD', '#2040FF')).toMatchObject({ fallback: 'editorial', acento: 'azul' })
    expect(fondo('#0B0B0D', null)).toMatchObject({ acento: null })
  })
})

describe('repararPlantilla · clamp y cajas', () => {
  it('lo que se sale de la imagen se recorta; lo de texto queda dentro del margen', () => {
    const r = ok(lectura({ modelo: z({ x: -0.2, y: -0.1, w: 1.5, h: 0.2 }, { color: '#FFFFFF' }), precio: z({ x: 0.5, y: 0.9, w: 0.9, h: 0.5 }, { color: '#FFFFFF' }) }))
    invariantes(r.plantilla)
  })
  it('una caja de texto más chica que su mínimo se agranda desde el centro', () => {
    const r = ok(lectura({ modelo: z({ x: 0.45, y: 0.12, w: 0.05, h: 0.01 }, { color: '#FFFFFF' }) }))
    expect(r.plantilla.modelo.caja.w).toBeGreaterThanOrEqual(MINIMOS.modelo.w)
    expect(r.plantilla.modelo.caja.h).toBeGreaterThanOrEqual(MINIMOS.modelo.h)
    invariantes(r.plantilla)
  })
})

describe('repararPlantilla · la moto', () => {
  it('una moto chica se agranda desde su centro hasta el mínimo y avisa', () => {
    const r = ok(lectura({ moto: z({ x: 0.45, y: 0.45, w: 0.1, h: 0.05 }) }))
    expect(r.plantilla.moto.w).toBeGreaterThanOrEqual(486)
    expect(r.plantilla.moto.h).toBeGreaterThanOrEqual(338)
    expect(r.avisos).toContainEqual({ zona: 'moto', codigo: 'moto_agrandada' })
    invariantes(r.plantilla)
  })
  it('una moto que ocupa toda la imagen se reduce al 75 % del área', () => {
    const r = ok(lectura({ moto: z({ x: 0, y: 0, w: 1, h: 1 }), modelo: z({ x: 0.05, y: 0.02, w: 0.9, h: 0.1 }), precio: z({ x: 0.05, y: 0.88, w: 0.9, h: 0.1 }), condicion: null, frase: null, cta: null, logos: [] }))
    invariantes(r.plantilla)
  })
})

describe('repararPlantilla · solapes', () => {
  it('un texto sobre la moto se corre fuera de ella', () => {
    const r = ok(lectura({ frase: z({ x: 0.1, y: 0.28, w: 0.5, h: 0.07 }, { color: '#FFFFFF', fuente: 'manuscrita' }) }))
    invariantes(r.plantilla)
    if (r.plantilla.frase) expect(interseca(r.plantilla.frase.caja, r.plantilla.moto)).toBe(false)
  })
  it('un texto opcional sin lugar se descarta con aviso (y la plantilla sigue siendo válida)', () => {
    const r = ok(lectura({ moto: z({ x: 0, y: 0.15, w: 1, h: 0.7 }), modelo: z({ x: 0.05, y: 0.02, w: 0.9, h: 0.1 }, { color: '#FFFFFF' }), precio: z({ x: 0.05, y: 0.88, w: 0.9, h: 0.1 }, { color: '#FFFFFF' }), frase: z({ x: 0.3, y: 0.4, w: 0.4, h: 0.1 }), cta: z({ x: 0.3, y: 0.5, w: 0.4, h: 0.1 }), condicion: z({ x: 0.3, y: 0.6, w: 0.4, h: 0.1 }), logos: [{ x: 0.4, y: 0.3, w: 0.2, h: 0.1 }] }))
    invariantes(r.plantilla)
    expect(r.avisos.filter((a) => a.codigo === 'descartada_sin_espacio').length).toBeGreaterThan(0)
  })
  it('precio y modelo encimados: el precio (mayor prioridad) conserva su caja y el modelo se corre', () => {
    const base = ok(lectura({ modelo: z({ x: 0.05, y: 0.05, w: 0.9, h: 0.1 }, { color: '#FFFFFF' }), frase: null, cta: null, condicion: null, logos: [] }))
    const choque = ok(lectura({ modelo: z({ x: 0.05, y: 0.8, w: 0.9, h: 0.08 }, { color: '#FFFFFF' }), frase: null, cta: null, condicion: null, logos: [] }))
    expect(choque.plantilla.precio.caja).toEqual(base.plantilla.precio.caja)
    invariantes(choque.plantilla)
  })
  it('condición, frase, CTA y logos nunca se pisan entre sí', () => {
    const cm = { x: 0.05, y: 0.8, w: 0.5, h: 0.08 }
    const r = ok(lectura({ condicion: z(cm, { color: '#FFFFFF' }), frase: z(cm, { color: '#FFFFFF' }), cta: z(cm, { color: '#FFFFFF' }), logos: [cm, cm] }))
    invariantes(r.plantilla)
  })
})

describe('repararPlantilla · contraste', () => {
  it('un texto del mismo color que el fondo pasa a blanco o negro con contraste ≥ 3', () => {
    const r = ok(lectura({ fondo: { color: '#0B0B0D' }, modelo: z({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#0B0B0D' }) }))
    expect(ratioContraste(r.plantilla.modelo.color, '#0B0B0D')).toBeGreaterThanOrEqual(3)
    expect(r.avisos).toContainEqual({ zona: 'modelo', codigo: 'color_corregido' })
  })
  it('condición y CTA exigen 4,5', () => {
    const r = ok(lectura({ fondo: { color: '#0B0B0D' }, condicion: z({ x: 0.58, y: 0.8, w: 0.37, h: 0.08 }, { color: '#444444' }), cta: z({ x: 0.05, y: 0.9, w: 0.4, h: 0.04 }, { color: '#444444', relleno: null }) }))
    expect(ratioContraste(r.plantilla.condicion!.color, '#0B0B0D')).toBeGreaterThanOrEqual(4.5)
    expect(ratioContraste(r.plantilla.cta!.color, '#0B0B0D')).toBeGreaterThanOrEqual(4.5)
  })
  it('el precio sobre una pastilla se mide contra el relleno, no contra el fondo', () => {
    const r = ok(lectura({ fondo: { color: '#0B0B0D' }, precio: z({ x: 0.05, y: 0.8, w: 0.5, h: 0.08 }, { color: '#FFFFFF', estilo: 'pastilla', relleno: '#FFFFFF' }), condicion: null, cta: null }))
    expect(ratioContraste(r.plantilla.precio.color, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    expect(r.plantilla.precio.relleno).toBe('#FFFFFF')
  })
  it('sobre un degradé se mide contra el color del centro de la caja', () => {
    // Texto en el medio de un degradé negro→blanco: el centro es gris; el contraste tiene que cumplirse contra ESE gris.
    const r = ok(lectura({ fondo: { tipo: 'degradado', color: '#000000', color2: '#FFFFFF', direccion: 'vertical' }, modelo: z({ x: 0.05, y: 0.45, w: 0.9, h: 0.1 }, { color: '#808080' }), moto: z({ x: 0.1, y: 0.6, w: 0.8, h: 0.35 }), precio: z({ x: 0.05, y: 0.05, w: 0.5, h: 0.08 }, { color: '#FFFFFF' }), condicion: null, frase: null, cta: null, logos: [] }))
    const caja = r.plantilla.modelo.caja
    const t = (caja.y + caja.h / 2) / r.plantilla.alto
    const gris = Math.round(255 * t).toString(16).padStart(2, '0').toUpperCase()
    expect(ratioContraste(r.plantilla.modelo.color, `#${gris}${gris}${gris}`)).toBeGreaterThanOrEqual(2.9)
  })
  it('un acento ilegible no rompe nada y queda con formato hex', () => {
    expect(ok(lectura({ acento: null })).plantilla.acento).toMatch(/^#[0-9A-F]{6}$/)
  })
})

describe('repararPlantilla · fondo, inclinación y fuentes', () => {
  it('fondo "foto" se usa como color plano (la foto de la referencia no se copia)', () => {
    const r = ok(lectura({ fondo: { tipo: 'foto', color: '#223344' } }))
    expect(r.plantilla.fondo).toMatchObject({ tipo: 'liso', color: '#223344' })
  })
  it('degradé sin segundo color es liso; con segundo color conserva la dirección (vertical por defecto)', () => {
    expect(ok(lectura({ fondo: { tipo: 'degradado', color: '#101010', color2: null } })).plantilla.fondo.tipo).toBe('liso')
    expect(ok(lectura({ fondo: { tipo: 'degradado', color: '#101010', color2: '#202020', direccion: null } })).plantilla.fondo).toMatchObject({ tipo: 'degradado', direccion: 'vertical' })
    expect(ok(lectura({ fondo: { tipo: 'degradado', color: '#101010', color2: '#202020', direccion: 'horizontal' } })).plantilla.fondo.direccion).toBe('horizontal')
  })
  it('sin color de fondo usa el negro de la marca', () => {
    expect(ok(lectura({ fondo: { color: null } })).plantilla.fondo.color).toBe('#0B0B0D')
  })
  it.each([[-15, -10], [-8, -10], [-7, -5], [-2, 0], [0, 0], [3, 5], [7, 5], [8, 10], [15, 10]])('inclinación %s → %s', (leida, esperada) => {
    const r = ok(lectura({ modelo: z({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#FFFFFF', inclinacion: leida }) }))
    expect(r.plantilla.modelo.inclinacion).toBe(esperada)
  })
  it('sin inclinación leída es 0', () => {
    expect(ok(lectura({ modelo: z({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#FFFFFF', inclinacion: null }) })).plantilla.modelo.inclinacion).toBe(0)
  })
  it('manuscrita en el modelo se sustituye por una condensada y se avisa; en la frase se respeta', () => {
    const r = ok(lectura({ modelo: z({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#FFFFFF', fuente: 'manuscrita' }) }))
    expect(r.plantilla.modelo.fuente).toBe('anton')
    expect(r.avisos).toContainEqual({ zona: 'modelo', codigo: 'fuente_sustituida' })
    expect(r.plantilla.frase?.fuente).toBe('kaushan')
  })
  it('serif se avisa en cualquier rol', () => {
    const r = ok(lectura({ precio: z({ x: 0.05, y: 0.8, w: 0.5, h: 0.08 }, { color: '#FFFFFF', fuente: 'serif' }) }))
    expect(r.avisos).toContainEqual({ zona: 'precio', codigo: 'fuente_sustituida' })
  })
  it('estilo del precio por defecto es "texto"; pastilla/barra sin relleno usan el acento', () => {
    expect(ok(lectura({ precio: z({ x: 0.05, y: 0.8, w: 0.5, h: 0.08 }, { color: '#FFFFFF' }) })).plantilla.precio.estilo).toBe('texto')
    const r = ok(lectura({ acento: '#E4FF1A', precio: z({ x: 0.05, y: 0.8, w: 0.5, h: 0.08 }, { color: '#0B0B0D', estilo: 'barra', relleno: null }) }))
    expect(r.plantilla.precio.relleno).toBe('#E4FF1A')
  })
})

describe('repararPlantilla · cualquier cosa que escriba el modelo (fuzz con semilla)', () => {
  // Generador determinístico (mulberry32): el test es repetible.
  const rng = (s: number) => () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  it('o es utilizable y cumple TODOS los invariantes, o es inutilizable con un motivo; nunca lanza', () => {
    const r = rng(2026)
    const n = (lo: number, hi: number) => lo + r() * (hi - lo)
    const caja = (): CajaRel => ({ x: n(-0.3, 1.2), y: n(-0.3, 1.2), w: n(-0.1, 1.3), h: n(-0.1, 1.3) })
    const fuentes = ['condensada', 'gruesa', 'expandida', 'geometrica', 'tecnica', 'stencil', 'manuscrita', 'pincel', 'retro', 'comic', 'serif', null] as const
    const colores = ['#000000', '#FFFFFF', '#808080', '#FF0000', '#1530C8', '#E4FF1A', null]
    const zona = (): ZonaCruda | null => (r() < 0.1 ? null : z(caja(), { color: colores[Math.floor(r() * colores.length)]!, fuente: fuentes[Math.floor(r() * fuentes.length)]!, inclinacion: Math.round(n(-15, 15)), relleno: colores[Math.floor(r() * colores.length)]!, estilo: (['texto', 'pastilla', 'barra', null] as const)[Math.floor(r() * 4)]! }))
    let utilizables = 0
    for (let i = 0; i < 600; i++) {
      const l = lectura({ moto: zona(), modelo: zona(), precio: zona(), condicion: zona(), frase: zona(), cta: zona(), logos: Array.from({ length: Math.floor(n(0, 3)) }, caja).slice(0, 2), fondo: { tipo: (['liso', 'degradado', 'foto', null] as const)[Math.floor(r() * 4)]!, color: colores[Math.floor(r() * colores.length)]!, color2: colores[Math.floor(r() * colores.length)]! } })
      const ref = { anchoRef: Math.round(n(512, 2048)), altoRef: Math.round(n(512, 2048)) }
      const res = repararPlantilla(l, ref)
      if (res.ok) {
        utilizables++
        invariantes(res.plantilla)
      } else {
        expect(['sin_moto', 'sin_zonas', 'sin_espacio']).toContain(res.motivo)
      }
    }
    expect(utilizables).toBeGreaterThan(50)
  })
  it('lo que pasa por leerLectura (entrada cruda) con basura también termina bien', () => {
    const cruda = leerLectura({ utilizable: true, zonas: { moto: { caja: { x: 0, y: 0, w: 1e9, h: 1e9 } }, modelo: { caja: { x: -1e9, y: 0, w: 5, h: 5 } }, precio: { caja: { x: 0, y: 0, w: 1, h: 1 } } } })
    if (!cruda.ok) throw new Error('debía leerse')
    const res = repararPlantilla(cruda.lectura, REF)
    if (res.ok) invariantes(res.plantilla)
  })
})
