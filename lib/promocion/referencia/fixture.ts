/** Plantillas de referencia de prueba (solo para tests): lecturas típicas pasadas por la reparación de verdad. */

import { repararPlantilla } from './reparar.ts'
import type { CajaRel, LecturaCruda, PlantillaReferencia, ZonaCruda } from './tipos.ts'

export const zona = (caja: CajaRel, o: Partial<ZonaCruda> = {}): ZonaCruda => ({ caja, color: null, fuente: null, alineacion: null, inclinacion: null, mayusculas: null, estilo: null, relleno: null, ...o })

/** Medidas (px) de las fotos de referencia más comunes. */
export const REFERENCIAS = {
  '4:5': { anchoRef: 1080, altoRef: 1350 },
  '1:1': { anchoRef: 1080, altoRef: 1080 },
  '9:16': { anchoRef: 1080, altoRef: 1920 },
  '3:4': { anchoRef: 1080, altoRef: 1440 },
  '16:9': { anchoRef: 1920, altoRef: 1080 },
} as const
export type AspectoReferencia = keyof typeof REFERENCIAS

/** Una placa "de manual": logo arriba, modelo, frase, moto al medio, precio y condición abajo, CTA al pie. */
export function lecturaTipica(o: Partial<LecturaCruda['zonas']> = {}): LecturaCruda {
  return {
    utilizable: true,
    motivo: 'ok',
    fondo: { tipo: 'degradado', color: '#0B0B0D', color2: '#1530C8', direccion: 'vertical' },
    acento: '#E4FF1A',
    zonas: {
      moto: zona({ x: 0.08, y: 0.32, w: 0.84, h: 0.36 }),
      modelo: zona({ x: 0.05, y: 0.1, w: 0.9, h: 0.1 }, { color: '#FFFFFF', fuente: 'condensada', mayusculas: true, alineacion: 'izquierda', inclinacion: 0 }),
      precio: zona({ x: 0.05, y: 0.76, w: 0.5, h: 0.08 }, { color: '#E4FF1A', fuente: 'gruesa', alineacion: 'centro', estilo: 'texto' }),
      condicion: zona({ x: 0.58, y: 0.76, w: 0.37, h: 0.08 }, { color: '#FFFFFF', fuente: 'condensada', alineacion: 'derecha' }),
      frase: zona({ x: 0.05, y: 0.21, w: 0.5, h: 0.08 }, { color: '#FFFFFF', fuente: 'manuscrita', alineacion: 'izquierda', inclinacion: -6 }),
      cta: zona({ x: 0.05, y: 0.88, w: 0.4, h: 0.05 }, { color: '#FFFFFF', relleno: '#E11D2E' }),
      logos: [{ x: 0.05, y: 0.02, w: 0.2, h: 0.05 }, { x: 0.7, y: 0.02, w: 0.25, h: 0.05 }],
      ...o,
    },
  }
}

export function plantillaDePrueba(aspecto: AspectoReferencia = '4:5', o: Partial<LecturaCruda['zonas']> = {}): PlantillaReferencia | null {
  const r = repararPlantilla(lecturaTipica(o), REFERENCIAS[aspecto])
  return r.ok ? r.plantilla : null
}
