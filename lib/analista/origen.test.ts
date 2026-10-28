import { describe, expect, it } from 'vitest'
import { aCampaniaFila, aPostFila, conjuntoDeHecho, type Origen } from './origen'
import { armarEntrada } from './entrada'
import { campania, filtrosZontes, post, ZONTES } from './fixture.test-util'
import { MARCAS } from '../datos/marcas'

/**
 * Ida y vuelta: los hechos los escribe armarHechos y origen.ts los lee. Si alguien
 * cambia el texto de un hecho, estos tests avisan antes de que la pantalla deje de
 * poder desplegar los datos.
 */

const publicaciones = [
  ...Array.from({ length: 6 }, () => post()),
  post({ vistas: 4000, texto: 'Zontes 350T', tipo: 'carrusel' }),
  post({ vistas: 200, tipo: 'imagen' }),
  post({ plataforma: 'facebook' }),
]
const campanias = [
  campania({ nombre: 'Zontes Hot Sale', resultados: 40, gasto: 40000 }),
  campania({ nombre: 'Zontes cuotas', resultados: 10 }),
  campania({ nombre: 'Zontes otra', resultados: 20 }),
]

const entrada = armarEntrada({ filtros: filtrosZontes, publicaciones, campanias, mensajes: [] })
const origen: Origen = { publicaciones: publicaciones.map(aPostFila), campanias: campanias.map(aCampaniaFila) }
const hecho = (prefijo: string) => entrada.hechos.find((h) => h.que.startsWith(prefijo))!

describe('conjuntoDeHecho', () => {
  it('cada hecho de publicaciones por plataforma, formato y día reconstruye exactamente su muestra', () => {
    const agrupados = entrada.hechos.filter((h) => /· (plataforma|formato|día de la semana) /.test(h.que))
    expect(agrupados.length).toBeGreaterThan(3)
    for (const h of agrupados) {
      const c = conjuntoDeHecho(h, origen)
      expect(c?.tipo, h.que).toBe('publicaciones')
      expect(c!.filas).toHaveLength(h.muestra!.cantidad)
    }
  })

  it('los totales del período muestran todas las publicaciones', () => {
    expect(conjuntoDeHecho(hecho('Vistas totales'), origen)!.filas).toHaveLength(publicaciones.length)
  })

  it('una publicación destacada se resuelve a ella misma', () => {
    const h = hecho('Mejor publicación')
    const c = conjuntoDeHecho(h, origen)
    expect(c).toMatchObject({ tipo: 'publicaciones', unaSola: true })
    expect(c!.filas.map((f) => (f as { vistas: number }).vistas)).toEqual([4000])
  })

  it('los hechos de campañas devuelven la campaña (o todas, en los totales publicitarios)', () => {
    const gasto = conjuntoDeHecho(hecho('Gasto de la campaña "Zontes Hot Sale"'), origen)
    expect(gasto).toMatchObject({ tipo: 'campanias' })
    expect(gasto!.filas).toHaveLength(1)
    expect(conjuntoDeHecho(hecho('Resultados de publicidad'), origen)!.filas).toHaveLength(3)
    expect(conjuntoDeHecho(hecho('Mejor campaña'), origen)!.filas).toHaveLength(1)
  })

  it('si el conjunto no suma la muestra del hecho (los datos cambiaron), no se ofrece', () => {
    const otraCuenta: Origen = { ...origen, publicaciones: origen.publicaciones.slice(0, 5) }
    expect(conjuntoDeHecho(hecho('Vistas totales'), otraCuenta)).toBeNull()
    const sinCamps: Origen = { ...origen, campanias: origen.campanias.slice(1) }
    expect(conjuntoDeHecho(hecho('Resultados de publicidad'), sinCamps)).toBeNull()
  })

  it('con varias marcas, el hecho por marca filtra por el nombre de la marca', () => {
    const otra = MARCAS.find((m) => m.id !== ZONTES.id)!
    const ps = [...Array.from({ length: 3 }, () => post()), ...Array.from({ length: 2 }, () => post({ marcaId: otra.id }))]
    const e = armarEntrada({ filtros: { ...filtrosZontes, marcaIds: [ZONTES.id, otra.id] }, publicaciones: ps, campanias: [], mensajes: [] })
    const h = e.hechos.find((x) => x.que === `Vistas promedio por publicación · marca ${otra.nombre}`)!
    expect(conjuntoDeHecho(h, { publicaciones: ps.map(aPostFila), campanias: [] })!.filas).toHaveLength(2)
  })

  it('los mensajes no salen de publicaciones ni campañas: no se ofrecen', () => {
    const e = armarEntrada({
      filtros: filtrosZontes, publicaciones, campanias,
      mensajes: [{ marcaId: ZONTES.id, plataforma: 'facebook', activas: 40, nuevas: 12, mensajes: 90 }],
    })
    expect(conjuntoDeHecho(e.hechos.find((h) => h.que.startsWith('Mensajes en'))!, origen)).toBeNull()
  })
})
