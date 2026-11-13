// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ajustarDiseno, alineacionDe, cajaRotada, dibujaFraseEnMayusculas, METRICAS, partirFrase } from './ajuste'
import { resolverDiseno } from './defaults'
import { anchoReal } from './medir-fuente'
import { bandaMoto, layoutDiseno, type Caja } from './layouts'
import { FUENTES_POR_ROL, ROLES_TEXTO, type IdFuente } from '../fuentes-placa'
import { INCLINACIONES, type Inclinacion } from './tipos'
import type { TextosPlaca } from '../plantillas'
import type { AspectoFoto } from '../../productor/ediciones'
import type { IdPlantillaDiseno } from '../tipos'

const PLANTILLAS: IdPlantillaDiseno[] = ['impactante_textura', 'deportiva', 'editorial']
const FORMATOS: AspectoFoto[] = ['4:5', '1:1', '9:16']
const datos = { precio: { moneda: 'ARS' as const, monto: 4_500_000 }, promo: { tipo: 'cuotas' as const, detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({ marca: 'Benelli', modelo: 'TRK 502', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes', ...o })
const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const ajustar = (pl: IdPlantillaDiseno, f: AspectoFoto, d: Parameters<typeof resolverDiseno>[0], t = textos()) => {
  const r = resolverDiseno(d, pl, { modelo: t.modelo, titular: t.titular, datos })
  return ajustarDiseno(t, r, layoutDiseno(pl, f, r.posicionFrase), pl)
}

describe('cajaRotada: el rectángulo que ocupa un texto después de rotarlo (alrededor del centro del propio texto)', () => {
  it('sin inclinación es el propio rectángulo, centrado', () => {
    expect(cajaRotada({ w: 100, h: 20 }, { w: 200, h: 60 }, 0, 'centro')).toEqual({ minX: 50, maxX: 150, minY: 20, maxY: 40 })
  })
  it('10° de un texto centrado: ancho = w·cos + h·sin, alto = w·sin + h·cos', () => {
    const r = cajaRotada({ w: 100, h: 20 }, { w: 200, h: 60 }, 10, 'centro')
    const c = Math.cos((10 * Math.PI) / 180)
    const s = Math.sin((10 * Math.PI) / 180)
    expect(r.maxX - r.minX).toBeCloseTo(100 * c + 20 * s, 6)
    expect(r.maxY - r.minY).toBeCloseTo(100 * s + 20 * c, 6)
    expect((r.minX + r.maxX) / 2).toBeCloseTo(100, 6)
  })
  it('el signo del ángulo no cambia el tamaño del rectángulo (solo espeja)', () => {
    const a = cajaRotada({ w: 100, h: 20 }, { w: 200, h: 60 }, 10, 'centro')
    const b = cajaRotada({ w: 100, h: 20 }, { w: 200, h: 60 }, -10, 'centro')
    expect(a.maxY - a.minY).toBeCloseTo(b.maxY - b.minY, 6)
  })
  it('un texto pegado a la izquierda o a la derecha sigue pegado a ese lado: solo se asoma lo que su esquina gira', () => {
    const izq = cajaRotada({ w: 100, h: 20 }, { w: 400, h: 60 }, 10, 'izquierda')
    expect(izq.minX).toBeGreaterThan(-20 * Math.sin((10 * Math.PI) / 180) / 2 - 1e-6)
    expect(izq.minX).toBeLessThanOrEqual(0)
    const der = cajaRotada({ w: 100, h: 20 }, { w: 400, h: 60 }, 10, 'derecha')
    expect(der.maxX).toBeGreaterThanOrEqual(400)
    expect(der.maxX).toBeLessThan(400 + 20 * Math.sin((10 * Math.PI) / 180) / 2 + 1e-6)
  })
})

describe('inclinación: el tamaño se achica hasta que el texto ROTADO entra en su caja', () => {
  it('rotar achica (o iguala) la letra: nunca la agranda', () => {
    for (const pl of PLANTILLAS) for (const f of FORMATOS) {
      const base = ajustar(pl, f, null)
      for (const g of [-10, -5, 5, 10] as Inclinacion[]) {
        const a = (() => { try { return ajustar(pl, f, { inclinacion: { modelo: g, frase: g, precio: g } }) } catch (e) { throw new Error(`${pl} ${f} ${g}: ${String(e)}`) } })()
        for (const rol of ROLES_TEXTO) expect(a[rol].tam, `${pl} ${f} ${rol} ${g}`).toBeLessThanOrEqual(base[rol].tam)
      }
    }
  })
  it('inclinación 0 en lo que ya es 0 no cambia nada (las placas existentes quedan igual)', () => {
    for (const pl of PLANTILLAS) for (const f of FORMATOS) expect(ajustar(pl, f, { inclinacion: { modelo: 0, precio: 0 } })).toEqual(ajustar(pl, f, null))
  })
  it('la frase de la impactante viene a -6° de fábrica: sin tocar nada el ajuste es el de siempre; recta o con otro ángulo, se mide aparte', () => {
    const sola = ajustar('impactante_textura', '4:5', null).frase
    expect(ajustar('impactante_textura', '4:5', { inclinacion: { frase: 0 } }).frase.tam).toBeGreaterThanOrEqual(sola.tam)
    expect(ajustar('impactante_textura', '4:5', { inclinacion: { frase: 10 } }).frase.tam).toBeLessThanOrEqual(sola.tam)
  })
  it('un modelo ancho a 10° se achica de verdad (la caja es baja)', () => {
    const t = textos({ modelo: 'TRK 502' })
    expect(ajustar('impactante_textura', '1:1', { inclinacion: { modelo: 10 } }, t).modelo.tam).toBeLessThan(ajustar('impactante_textura', '1:1', null, t).modelo.tam)
  })

  const MODELOS = ['TRK 502', 'Street Triple 765', 'Ninja ZX-6R ABS']
  const FRASES = ['Tu próxima aventura', 'Rompé la rutina']
  const PRECIOS = ['$ 4.500.000', 'US$ 12.000', '$ 18.990.000']
  for (const pl of PLANTILLAS) for (const f of FORMATOS) {
    it(`${pl} · ${f}: con cualquier fuente y cualquier ángulo, el texto rotado (medido en el archivo) queda DENTRO de su caja y la caja fuera de la moto`, () => {
      const layout = layoutDiseno(pl, f)
      const banda = bandaMoto(layout)
      for (const rol of ROLES_TEXTO) {
        const caja = layout.cajas[rol]
        expect(solapan(caja, banda), `${rol} sobre la moto`).toBe(false)
        for (const fuente of FUENTES_POR_ROL[rol] as readonly IdFuente[]) for (const g of INCLINACIONES) {
          if (g === 0) continue
          for (const valor of rol === 'modelo' ? MODELOS : rol === 'frase' ? FRASES : PRECIOS) {
            const t = textos(rol === 'modelo' ? { modelo: valor } : rol === 'frase' ? { titular: valor } : { precio: valor })
            const r = resolverDiseno({ fuentes: { [rol]: fuente }, inclinacion: { [rol]: g } }, pl, { modelo: t.modelo, titular: t.titular, datos })
            const a = ajustarDiseno(t, r, layout, pl)
            const aj = a[rol]
            const m = METRICAS[fuente]
            const enMayus = dibujaFraseEnMayusculas(pl, fuente)
            const frase = enMayus ? valor.toUpperCase() : valor
            // La deportiva parte la frase en dos filas (dos colores): lo que ancho es la fila más larga; el resto es una sola caja de texto.
            const [f1, f2] = partirFrase(frase)
            const dep = pl === 'deportiva' && rol === 'frase'
            const dibujado = rol === 'modelo' ? t.modelo.toUpperCase() : rol === 'frase' ? (dep ? (f1.length >= f2.length ? f1 : f2) : frase) : a.textoPrecio
            const filas = dep ? (f2 ? 2 : 1) : 1
            const lineas = dep ? 1 : aj.lineas
            // Una sola línea: ancho real del archivo; varias: el ancho completo de la caja.
            const wReal = lineas === 1 ? anchoReal(fuente, dibujado) * aj.tam : caja.w
            const rect = cajaRotada({ w: Math.min(wReal, caja.w * 1.05), h: lineas * filas * aj.tam * m.linea }, caja, g, alineacionDe(pl, rol, r.posicionFrase))
            const tol = 1.05
            const etiqueta = `${rol} ${fuente} ${g}° "${valor}" a ${aj.tam}px`
            // Vertical: ±4 % del alto de la caja por el desvío de las constantes heredadas (el ancho real pasa a la heurística en un ~4 %).
            expect(rect.minY, etiqueta).toBeGreaterThanOrEqual(-caja.h * 0.04 - 0.5)
            expect(rect.maxY, etiqueta).toBeLessThanOrEqual(caja.h * 1.04 + 0.5)
            expect(rect.minX, etiqueta).toBeGreaterThanOrEqual(-caja.w * (tol - 1) - 0.5)
            expect(rect.maxX, etiqueta).toBeLessThanOrEqual(caja.w * tol + 0.5)
          }
        }
      }
    })
  }
})
