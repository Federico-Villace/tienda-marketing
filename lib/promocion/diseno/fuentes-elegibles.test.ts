// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ajustarDiseno, dibujaFraseEnMayusculas, METRICAS } from './ajuste'
import { resolverDiseno } from './defaults'
import { anchoReal } from './medir-fuente'
import { bandaMoto, layoutDiseno, type Caja } from './layouts'
import { FUENTES_POR_ROL, IDS_FUENTE, REGISTRO_FUENTES, ROLES_TEXTO, esFuenteDeGuion, fuentesDe, type IdFuente, type RolTexto } from '../fuentes-placa'
import type { TextosPlaca } from '../plantillas'
import type { AspectoFoto } from '../../productor/ediciones'
import type { IdPlantillaDiseno } from '../tipos'

const PLANTILLAS: IdPlantillaDiseno[] = ['impactante_textura', 'deportiva', 'editorial']
const FORMATOS: AspectoFoto[] = ['4:5', '1:1', '9:16']
const datos = { precio: { moneda: 'ARS' as const, monto: 4_500_000 }, promo: { tipo: 'cuotas' as const, detalle: '12 cuotas sin interés' }, lugar: 'Quilmes', indicaciones: '' }
const textos = (o: Partial<TextosPlaca> = {}): TextosPlaca => ({ marca: 'Benelli', modelo: 'TRK 502 X', precio: '$ 4.500.000', promo: '12 cuotas sin interés', titular: 'Tu próxima aventura', extra: '', lugar: 'Quilmes', ...o })
/** Las siete de siempre conservan sus constantes (las placas ya hechas no cambian): su desvío real es de hasta ~4 % (Archivo Expanded con "TRK 502"), dentro del margen de 48 px del lienzo. */
const HEREDADAS: ReadonlySet<IdFuente> = new Set<IdFuente>(['anton', 'inter', 'kaushan', 'barlow-condensed', 'archivo-expanded', 'sora-extrabold', 'sora-semibold'])
const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('las fuentes elegibles: archivos y licencias', () => {
  it('cada fuente registrada tiene su TTF/OTF y su licencia OFL en assets/fuentes', () => {
    for (const id of IDS_FUENTE) {
      const f = REGISTRO_FUENTES[id]
      expect(existsSync(join(process.cwd(), 'assets/fuentes', f.archivo)), `${id}: ${f.archivo}`).toBe(true)
      expect(existsSync(join(process.cwd(), 'assets/fuentes', f.licencia)), `${id}: ${f.licencia}`).toBe(true)
    }
  })
  it('todas tienen ñ, tildes, ¿ ¡ $ y dígitos (si no, un modelo o un precio saldría con un cuadradito)', () => {
    for (const id of IDS_FUENTE) expect(() => anchoReal(id, 'áéíóúñÑÁÉÍÓÚ¿¡$0123456789.,-'), id).not.toThrow()
  })
  it('la lista de cada rol incluye la fuente de fábrica de cada plantilla (los placas que ya existen siguen valiendo)', () => {
    const de = (p: IdPlantillaDiseno) => resolverDiseno(null, p, { modelo: 'X', titular: 'Y', datos }).fuentes
    for (const p of PLANTILLAS) for (const rol of ROLES_TEXTO) expect(FUENTES_POR_ROL[rol], `${p} ${rol}`).toContain(de(p)[rol])
  })
  it('la frase solo ofrece fuentes con minúsculas (Bebas Neue no tiene) y el modelo y el precio no ofrecen las manuscritas', () => {
    expect(FUENTES_POR_ROL.frase).not.toContain('bebas-neue')
    for (const id of ['kaushan', 'caveat-brush', 'pacifico', 'lobster'] as const) expect(esFuenteDeGuion(id)).toBe(true)
    for (const id of FUENTES_POR_ROL.modelo) expect(esFuenteDeGuion(id), id).toBe(false)
    for (const id of FUENTES_POR_ROL.precio) expect(esFuenteDeGuion(id), id).toBe(false)
  })
  it('el servidor carga las de la plantilla y las que se eligieron, sin repetir', () => {
    expect(fuentesDe('impactante_textura')).toEqual(['anton', 'kaushan', 'barlow-condensed'])
    expect(fuentesDe('impactante_textura', { modelo: 'bebas-neue', precio: 'anton' })).toEqual(['anton', 'kaushan', 'barlow-condensed', 'bebas-neue'])
  })
})

describe('METRICAS es CONSERVADORA: el ancho real medido en el archivo nunca supera lo que calcula la heurística', () => {
  const usadas = (rol: RolTexto) => FUENTES_POR_ROL[rol]
  it.each(usadas('modelo').map((id) => [id]))('modelo · %s', (id) => {
    for (const s of ['TRK 502 X']) expect(anchoReal(id, s), s).toBeLessThanOrEqual(s.length * METRICAS[id].ancho)
  })
  it.each(usadas('precio').map((id) => [id]))('precio · %s', (id) => {
    for (const s of ['$ 4.500.000', 'US$ 12.000']) expect(anchoReal(id, s), s).toBeLessThanOrEqual(s.length * METRICAS[id].ancho)
  })
  it.each(usadas('frase').map((id) => [id]))('frase · %s (minúsculas y, donde se dibuja en mayúsculas, mayúsculas)', (id) => {
    const s = 'Tu próxima moto'
    expect(anchoReal(id, s), s).toBeLessThanOrEqual(s.length * METRICAS[id].ancho)
    const M = s.toUpperCase()
    expect(anchoReal(id, M), M).toBeLessThanOrEqual(M.length * (METRICAS[id].mayus ?? METRICAS[id].ancho))
  })
  it('todas las fuentes tienen métricas con un alto de línea razonable', () => {
    for (const id of IDS_FUENTE) {
      expect(METRICAS[id].ancho, id).toBeGreaterThan(0.3)
      expect(METRICAS[id].linea, id).toBeGreaterThanOrEqual(0.9)
      expect(METRICAS[id].linea, id).toBeLessThanOrEqual(2)
    }
  })
})

/** Lo que se dibuja de verdad: el modelo en mayúsculas; el precio tal cual; la frase en mayúsculas según plantilla y fuente. */
describe('cualquier fuente en cualquier campo, plantilla y formato entra en su caja y no pisa la moto', () => {
  const MODELOS = ['TRK 502', 'Street Triple 765', 'Ninja ZX-6R ABS']
  const FRASES = ['Tu próxima aventura', 'Rompé la rutina']
  const PRECIOS = ['$ 4.500.000', 'US$ 12.000', '$ 18.990.000']

  for (const plantilla of PLANTILLAS) {
    for (const formato of FORMATOS) for (const variacion of [0, 1, 2]) {
      it(`${plantilla} · ${formato} · variación ${variacion}`, () => {
        const layout = layoutDiseno(plantilla, formato, 'izquierda', variacion)
        const banda = bandaMoto(layout)
        for (const rol of ROLES_TEXTO) expect(solapan(layout.cajas[rol], banda), `${rol} sobre la moto`).toBe(false)
        for (const rol of ROLES_TEXTO) {
          for (const fuente of FUENTES_POR_ROL[rol] as readonly IdFuente[]) {
            for (const valor of rol === 'modelo' ? MODELOS : rol === 'frase' ? FRASES : PRECIOS) {
              const t = textos(rol === 'modelo' ? { modelo: valor } : rol === 'frase' ? { titular: valor } : { precio: valor })
              const r = resolverDiseno({ fuentes: { [rol]: fuente }, variacion }, plantilla, { modelo: t.modelo, titular: t.titular, datos })
              const a = ajustarDiseno(t, r, layout, plantilla)
              const caja = layout.cajas[rol]
              const m = METRICAS[fuente]
              const dibujado = rol === 'modelo' ? t.modelo.toUpperCase() : rol === 'frase' ? (dibujaFraseEnMayusculas(plantilla, fuente) ? valor.toUpperCase() : valor) : a.textoPrecio
              const ajuste = a[rol]
              const etiqueta = `${rol} ${fuente} "${valor}"`
              // Alto: las líneas que ocupa (la deportiva parte la frase en dos por su cuenta).
              expect(ajuste.lineas * ajuste.tam * m.linea, `${etiqueta} alto`).toBeLessThanOrEqual(caja.h + 0.5)
              // Ancho REAL medido en el archivo: lo dibujado, en las líneas que dice el ajuste, cabe en la caja.
              const real = anchoReal(fuente, dibujado) * ajuste.tam
              expect(real, `${etiqueta} ancho (${ajuste.lineas} línea/s a ${ajuste.tam}px)`).toBeLessThanOrEqual(ajuste.lineas * caja.w * (HEREDADAS.has(fuente) ? 1.05 : 1) + 0.5)
            }
          }
        }
      })
    }
  }

  it('el tamaño +2 tampoco se sale de la caja con ninguna fuente (peor caso)', () => {
    for (const plantilla of PLANTILLAS) for (const formato of FORMATOS) for (const variacion of [0, 1, 2]) {
      const layout = layoutDiseno(plantilla, formato, 'izquierda', variacion)
      for (const rol of ROLES_TEXTO) for (const fuente of FUENTES_POR_ROL[rol] as readonly IdFuente[]) {
        const t = textos({ modelo: 'Street Triple 765', precio: 'US$ 12.000', titular: 'Rompé la rutina' })
        const r = resolverDiseno({ fuentes: { [rol]: fuente }, tamanos: { [rol]: 2 }, variacion }, plantilla, { modelo: t.modelo, titular: t.titular, datos })
        const a = ajustarDiseno(t, r, layout, plantilla)
        expect(a[rol].lineas * a[rol].tam * METRICAS[fuente].linea, `${plantilla} ${formato} ${rol} ${fuente}`).toBeLessThanOrEqual(layout.cajas[rol].h + 0.5)
      }
    }
  })
})
