/**
 * Datos de prueba compartidos por los tests del Analista v4: una entrada real
 * (armarEntrada) de una marca con posts, campañas y mensajes.
 */
import { MARCAS } from '../datos/marcas'
import type { Filtros } from '../datos/filtros'
import type { CampaniaReal } from '../datos/publicidad'
import type { Publicacion } from '../datos/tipos'
import { armarEntrada, type DatosAnalisis, type EntradaAnalisis } from './entrada'

export const ZONTES = MARCAS.find((m) => m.nombre === 'Zontes Quilmes')!

export const filtrosZontes: Filtros = { marcaIds: [ZONTES.id], plataforma: 'todas', desde: '2026-09-21', hasta: '2026-10-20' }

let n = 0
export const post = (o: Partial<Publicacion> = {}): Publicacion => {
  n += 1
  return {
    id: `id-post-${n}`,
    marcaId: ZONTES.id,
    plataforma: 'instagram',
    tipo: 'reel',
    texto: `Zontes TRK 502 ${n}`,
    permalink: `https://instagram.com/p/perma${n}`,
    publicadoEn: new Date('2026-10-03T15:00:00Z'),
    vistas: 1000,
    alcance: null,
    clics: null,
    meGusta: 50,
    comentarios: 1,
    compartidos: 0,
    guardados: 0,
    ...o,
  }
}

export const campania = (o: Partial<CampaniaReal> = {}): CampaniaReal => {
  n += 1
  return {
    id: `id-camp-${n}`,
    nombre: `Zontes campaña ${n}`,
    cuenta: 'cuenta-secreta',
    objetivo: 'OUTCOME_ENGAGEMENT',
    estado: 'ACTIVE',
    gasto: 30000,
    impresiones: 100000,
    clics: 400,
    resultados: 20,
    dias: 10,
    ultimoDia: '2026-10-19',
    ...o,
  }
}

export function entradaDePrueba(extra: Partial<DatosAnalisis> = {}): EntradaAnalisis {
  n = 0
  const publicaciones = [
    ...Array.from({ length: 9 }, () => post()),
    post({ vistas: 4000, texto: 'Zontes 350T lista para la ruta' }),
    post({ vistas: 200, tipo: 'imagen', texto: 'Service oficial' }),
  ]
  const campanias = [campania({ resultados: 40, gasto: 40000, nombre: 'Zontes Hot Sale' }), campania({ resultados: 10, gasto: 30000 }), campania({ resultados: 20, gasto: 30000 })]
  return armarEntrada({
    filtros: filtrosZontes,
    publicaciones,
    campanias,
    mensajes: [{ marcaId: ZONTES.id, plataforma: 'facebook', activas: 40, nuevas: 12, mensajes: 90 }],
    ...extra,
  })
}
