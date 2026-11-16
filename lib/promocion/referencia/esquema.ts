/**
 * Parseo estricto de la lectura de la referencia. La respuesta del modelo de visión es ENTRADA NO CONFIABLE (una imagen
 * puede traer texto que intente dar órdenes): acá se reconstruye un objeto nuevo con SOLO las claves conocidas, los enums
 * se cierran, los colores son '#RRGGBB' y los números son finitos. No hay ningún campo de texto libre: una inyección
 * dentro de la imagen, como mucho, mueve números, y la reparación (reparar.ts) los acota. Puro.
 */

import {
  ALINEACIONES,
  CATEGORIAS_FUENTE,
  ESTILOS_PRECIO,
  MOTIVOS_LECTURA,
  type AlineacionRef,
  type CajaRel,
  type CategoriaFuente,
  type EstiloPrecio,
  type Hex,
  type LecturaCruda,
  type MotivoLectura,
  type ZonaCruda,
} from './tipos.ts'

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const propio = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined)

const enumDe = <T extends string>(lista: readonly T[], x: unknown): T | null => (typeof x === 'string' && (lista as readonly string[]).includes(x) ? (x as T) : null)
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null)

export function leerHex(x: unknown): Hex | null {
  return typeof x === 'string' && /^#[0-9A-Fa-f]{6}$/.test(x) ? x.toUpperCase() : null
}

export function leerCaja(x: unknown): CajaRel | null {
  if (!esObj(x)) return null
  const [cx, cy, cw, ch] = [num(propio(x, 'x')), num(propio(x, 'y')), num(propio(x, 'w')), num(propio(x, 'h'))]
  return cx === null || cy === null || cw === null || ch === null ? null : { x: cx, y: cy, w: cw, h: ch }
}

function leerZona(x: unknown): ZonaCruda | null {
  if (!esObj(x)) return null
  const caja = leerCaja(propio(x, 'caja'))
  if (!caja) return null
  const incl = num(propio(x, 'inclinacion'))
  return {
    caja,
    color: leerHex(propio(x, 'color')),
    fuente: enumDe<CategoriaFuente>(CATEGORIAS_FUENTE, propio(x, 'fuente')),
    alineacion: enumDe<AlineacionRef>(ALINEACIONES, propio(x, 'alineacion')),
    inclinacion: incl === null ? null : Math.max(-15, Math.min(15, Math.round(incl))),
    mayusculas: bool(propio(x, 'mayusculas')),
    estilo: enumDe<EstiloPrecio>(ESTILOS_PRECIO, propio(x, 'estilo')),
    relleno: leerHex(propio(x, 'relleno')),
  }
}

export type ResultadoLectura = { ok: true; lectura: LecturaCruda } | { ok: false; error: string }

export function leerLectura(x: unknown): ResultadoLectura {
  if (!esObj(x)) return { ok: false, error: 'La lectura no es un objeto.' }
  const utilizable = propio(x, 'utilizable')
  if (typeof utilizable !== 'boolean') return { ok: false, error: 'Falta "utilizable" (verdadero o falso).' }
  const zonas = propio(x, 'zonas')
  if (!esObj(zonas)) return { ok: false, error: 'Faltan las zonas.' }

  const motivoLeido = enumDe<MotivoLectura>(MOTIVOS_LECTURA, propio(x, 'motivo'))
  const motivo: MotivoLectura = utilizable ? 'ok' : motivoLeido && motivoLeido !== 'ok' ? motivoLeido : 'ilegible'

  const fondo = propio(x, 'fondo')
  const f = esObj(fondo) ? fondo : {}
  const logos = propio(zonas, 'logos')

  return {
    ok: true,
    lectura: {
      utilizable,
      motivo,
      fondo: {
        tipo: enumDe(['liso', 'degradado', 'foto'] as const, propio(f, 'tipo')),
        color: leerHex(propio(f, 'color')),
        color2: leerHex(propio(f, 'color2')),
        direccion: enumDe(['vertical', 'horizontal'] as const, propio(f, 'direccion')),
      },
      acento: leerHex(propio(x, 'acento')),
      zonas: {
        moto: leerZona(propio(zonas, 'moto')),
        modelo: leerZona(propio(zonas, 'modelo')),
        precio: leerZona(propio(zonas, 'precio')),
        condicion: leerZona(propio(zonas, 'condicion')),
        frase: leerZona(propio(zonas, 'frase')),
        cta: leerZona(propio(zonas, 'cta')),
        logos: Array.isArray(logos) ? logos.map((l) => leerCaja(esObj(l) ? propio(l, 'caja') : null)).filter((c): c is CajaRel => c !== null).slice(0, 2) : [],
      },
    },
  }
}
