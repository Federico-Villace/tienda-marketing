/**
 * Datos de muestra.
 *
 * Las marcas, páginas y cuentas de Instagram son las REALES, descubiertas con
 * scripts/verificar-permisos-meta.sh. Las métricas son inventadas y
 * deterministas: el mismo generador devuelve siempre lo mismo, así el tablero
 * no cambia entre recargas y se puede razonar sobre lo que muestra.
 *
 * Se borra entero cuando entre la ingesta real. Nada de la app depende de este
 * archivo salvo la fuente de datos, que es una sola función.
 */

import type { Campania, Marca, Publicacion, TipoPublicacion } from './tipos'

export const MARCAS: readonly Marca[] = [
  { id: '696225363810951', nombre: '999motos', usuarioIg: '999motos', paginaFb: '999motos' },
  { id: '1322217014300342', nombre: 'Motoplex Quilmes', usuarioIg: 'motoplex.quilmes', paginaFb: 'Motoplex Quilmes' },
  { id: '100206789578448', nombre: 'Suzuki Quilmes', usuarioIg: 'suzukiquilmescentro', paginaFb: 'Suzuki Quilmes' },
  { id: '1838303613073060', nombre: 'Benelli Store Quilmes', usuarioIg: 'benellistorequilmes', paginaFb: 'Benelli Store Quilmes' },
  { id: '1018745801320840', nombre: 'QJ Motor Quilmes', usuarioIg: 'qjmotor.quilmes', paginaFb: 'QJ Motor Quilmes' },
  { id: '1327958853726987', nombre: 'Zontes Quilmes', usuarioIg: 'zontes.quilmes', paginaFb: 'Zontes Quilmes' },
  { id: '848683938337644', nombre: 'MotoMorini Quilmes', usuarioIg: 'motomorini.quilmes', paginaFb: 'MotoMorini Quilmes' },
]

/** Generador determinista: misma semilla, misma secuencia. */
function azar(semilla: number): () => number {
  let estado = semilla
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296
    return estado / 4294967296
  }
}

const TIPOS: readonly TipoPublicacion[] = ['reel', 'imagen', 'carrusel', 'video']

/** Los reels rinden más que las fotos. Es el patrón que el Analista debería encontrar. */
const MULTIPLICADOR: Record<TipoPublicacion, number> = {
  reel: 3.2,
  video: 1.8,
  carrusel: 1.4,
  imagen: 1,
  historia: 0.6,
}

const TEXTOS = [
  'Financiación en 12 cuotas sin interés',
  'Nueva unidad disponible en el salón',
  'Entrega inmediata, patentamiento incluido',
  'Service oficial con turno online',
  'Permutamos tu usada por una 0km',
  'Llegaron las nuevas unidades 2027',
  'Probá antes de comprar: test ride',
  'Accesorios y cascos con descuento',
]

const DIA_MS = 86_400_000

export function publicacionesDeMuestra(dias = 90): Publicacion[] {
  const publicaciones: Publicacion[] = []
  const hoy = Date.UTC(2026, 9, 1)

  MARCAS.forEach((marca, indiceMarca) => {
    const random = azar(indiceMarca * 7919 + 13)
    // 999motos es la marca madre: publica bastante más que las demás.
    const porSemana = indiceMarca === 0 ? 5 : 2 + Math.floor(random() * 2)
    const cantidad = Math.floor((dias / 7) * porSemana)
    const base = indiceMarca === 0 ? 2800 : 600 + Math.floor(random() * 700)

    for (let i = 0; i < cantidad; i += 1) {
      const tipo = TIPOS[Math.floor(random() * TIPOS.length)] ?? 'imagen'
      const publicadoEn = new Date(hoy - Math.floor(random() * dias) * DIA_MS)

      // Los fines de semana rinden peor en este rubro.
      const finDeSemana = [0, 6].includes(publicadoEn.getUTCDay())
      const vistas = Math.round(
        base * MULTIPLICADOR[tipo] * (0.5 + random()) * (finDeSemana ? 0.7 : 1),
      )
      const tasa = 0.015 + random() * 0.045

      publicaciones.push({
        id: `${marca.id}-${i}`,
        marcaId: marca.id,
        plataforma: random() > 0.3 ? 'instagram' : 'facebook',
        tipo,
        texto: TEXTOS[Math.floor(random() * TEXTOS.length)] ?? TEXTOS[0]!,
        publicadoEn,
        vistas,
        meGusta: Math.round(vistas * tasa * 0.7),
        comentarios: Math.round(vistas * tasa * 0.1),
        compartidos: Math.round(vistas * tasa * 0.08),
        guardados: Math.round(vistas * tasa * 0.12),
      })
    }
  })

  return publicaciones.sort(
    (a, b) => b.publicadoEn.getTime() - a.publicadoEn.getTime(),
  )
}

const OBJETIVOS = ['Mensajes', 'Tráfico', 'Alcance', 'Conversiones'] as const

export function campaniasDeMuestra(): Campania[] {
  return MARCAS.flatMap((marca, indiceMarca) => {
    const random = azar(indiceMarca * 104729 + 7)
    const cuantas = indiceMarca === 0 ? 3 : 1

    return Array.from({ length: cuantas }, (_, i) => {
      const gasto = Math.round((indiceMarca === 0 ? 180 : 60) * (0.6 + random()))
      const impresiones = Math.round(gasto * (900 + random() * 600))
      const clics = Math.round(impresiones * (0.008 + random() * 0.022))

      return {
        id: `${marca.id}-c${i}`,
        marcaId: marca.id,
        nombre: `${OBJETIVOS[i % OBJETIVOS.length]} · ${marca.nombre}`,
        objetivo: OBJETIVOS[i % OBJETIVOS.length]!,
        estado: (random() > 0.35 ? 'activa' : 'finalizada') as Campania['estado'],
        gasto,
        impresiones,
        clics,
        conversiones: Math.round(clics * (0.02 + random() * 0.06)),
      }
    })
  })
}
