/** Lectura del manifiesto de logos con fs (solo servidor). Se lee una vez por instancia. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dimensionesDe, formatoDe } from '../productor/dimensiones.ts'
import { validarManifiesto, type ManifiestoLeido } from './logos.ts'

const raizLogos = () => join(process.cwd(), 'assets/logos')

let cache: ManifiestoLeido | null = null

/** Lanza si el manifiesto está mal armado: es un error de despliegue, no del usuario. */
export function leerManifiesto(): ManifiestoLeido {
  if (cache) return cache
  const raiz = raizLogos()
  const v = validarManifiesto(JSON.parse(readFileSync(join(raiz, 'manifiesto.json'), 'utf8')), (r) => existsSync(join(raiz, r)))
  if (!v.ok) throw new Error(`assets/logos/manifiesto.json inválido: ${v.errores.join(' ')}`)
  const marcas: ManifiestoLeido['marcas'] = {}
  for (const [id, e] of Object.entries(v.manifiesto.marcas)) {
    marcas[id] = {
      ...e,
      logos: e.logos.map((l) => {
        const bytes = new Uint8Array(readFileSync(join(raiz, e.carpeta, l.archivo)))
        const d = dimensionesDe(bytes)
        return { ...l, ancho: d?.ancho ?? null, alto: d?.alto ?? null, formato: formatoDe(bytes) }
      }),
    }
  }
  cache = { logo999: v.manifiesto.logo999, marcas }
  return cache
}

/** Ruta absoluta de un logo del manifiesto (ya validado: nunca sale de assets/logos). */
export const rutaDeLogo = (carpeta: string, archivo: string): string => join(raizLogos(), carpeta, archivo)
