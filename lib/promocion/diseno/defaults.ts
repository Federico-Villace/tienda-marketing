/** Del diseño guardado (parcial o null) al diseño completo que dibuja la placa. Puro. */

import { FUENTE_POR_DEFECTO } from '../fuentes-placa.ts'
import type { DatosPromocion, IdPlantillaDiseno } from '../tipos.ts'
import type { PlantillaReferencia } from '../referencia/tipos.ts'
import { acentoPorDefecto } from './paletas.ts'
import { INCLINACION_POR_DEFECTO, LIMITES_DISENO, type Condicion, type Diseno, type DisenoResuelto } from './tipos.ts'

const recortar = (t: string, max: number): string => {
  const x = t.trim()
  if (x.length <= max) return x
  const corte = x.slice(0, max + 1).lastIndexOf(' ')
  return (corte > 0 ? x.slice(0, corte) : x.slice(0, max)).trim()
}

/** "12 cuotas sin interés" → 12 CUOTAS / SIN INTERÉS; contado y crédito por su nombre; detalle libre en mayúsculas. */
export function condicionPorDefecto(promo: DatosPromocion['promo']): Condicion {
  const detalle = promo.detalle.trim()
  const cuotas = /^(\d{1,2})\s*cuotas?\b(.*)$/i.exec(detalle)
  if (promo.tipo === 'cuotas' && cuotas) {
    return { texto: `${cuotas[1]} CUOTAS`, destacado: recortar(cuotas[2]!.toUpperCase(), LIMITES_DISENO.CONDICION_DESTACADO) }
  }
  const porTipo: Record<DatosPromocion['promo']['tipo'], string> = { contado: 'CONTADO', credito: 'CRÉDITO', cuotas: 'CUOTAS', oferta: 'OFERTA', ninguna: '' }
  if (promo.tipo === 'contado' || promo.tipo === 'credito') return { texto: porTipo[promo.tipo], destacado: '' }
  return { texto: recortar(detalle.toUpperCase(), LIMITES_DISENO.CONDICION_TEXTO) || porTipo[promo.tipo], destacado: '' }
}

/** El primer grupo de dígitos del modelo ("TRK 251 ABS" → "251"), hasta 4. */
export function numeroDeModelo(modelo: string): string {
  return /\d+/.exec(modelo)?.[0].slice(0, LIMITES_DISENO.NUMERO) ?? ''
}

export function resolverDiseno(
  diseno: Diseno | null,
  plantilla: IdPlantillaDiseno,
  fila: { modelo: string; /** El titular de la placa (el de la promoción o el del texto elegido). */ titular: string; datos: DatosPromocion },
  /** Solo la plantilla 'referencia': de lo leído salen las fuentes y la inclinación de fábrica. */
  referencia?: PlantillaReferencia,
): DisenoResuelto {
  const d = diseno ?? {}
  const deFabrica = plantilla === 'referencia' && referencia
  const fuentes = deFabrica ? { modelo: referencia.modelo.fuente, frase: referencia.frase?.fuente ?? FUENTE_POR_DEFECTO.referencia!.frase, precio: referencia.precio.fuente } : FUENTE_POR_DEFECTO[plantilla]!
  const inclinacion = deFabrica ? { modelo: referencia.modelo.inclinacion, frase: referencia.frase?.inclinacion ?? 0, precio: 0 } : INCLINACION_POR_DEFECTO[plantilla]!
  return {
    acento: d.acento ?? acentoPorDefecto(plantilla),
    mostrarPrecio: d.mostrarPrecio ?? true,
    condicion: d.condicion ?? condicionPorDefecto(fila.datos.promo),
    cta: d.cta ?? 'Consultanos',
    frase: d.frase ?? recortar(fila.titular, LIMITES_DISENO.FRASE),
    lista: d.lista ?? [],
    numero: d.numero ?? numeroDeModelo(fila.modelo),
    tamanos: { modelo: 0, frase: 0, precio: 0, ...d.tamanos },
    fuentes: { ...fuentes, ...d.fuentes },
    inclinacion: { ...inclinacion, ...d.inclinacion },
    variacion: d.variacion ?? 0,
    posicionFrase: d.posicionFrase ?? 'izquierda',
    logoMarca: d.logoMarca ?? null,
    ocultos: d.ocultos ?? [],
  }
}
