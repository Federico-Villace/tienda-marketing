/**
 * Prompt de la escena de una promoción (la imagen de fondo que Gemini edita desde la
 * foto real). El texto, el precio y todo lo que se lee NO lo dibuja la IA: va encima,
 * en la composición determinística de la placa. Por eso la escena deja libre un sector.
 *
 * Reglas fijas (no modificar la moto, nada de texto) = las mismas de editar una foto.
 * Lo que la persona pide para el FONDO (descripción, foto de inspiración) manda sobre el
 * fondo armado, pero nunca sobre la moto: va delimitado y las reglas van después y prevalecen.
 */

import { limpiarDescripcion } from '../agentes/texto-seguro.ts'
import { descripcionLimpia, faltaPedidoDeFondo, instruccionFondo, MAX_DESCRIPCION_FONDO, MENSAJE_FALTA_DESCRIPCION, textoReferencia, type ModoInspiracionImagen } from '../imagenes/fondos.ts'
import { REGLAS_EDICION_FOTO, type Aspecto } from '../productor/prompt.ts'
import type { IdFondo, PosicionMoto, ZonaTexto } from './tipos.ts'

/**
 * Cambiar el texto de abajo obliga a subir esta versión.
 * v3: la descripción de la persona MANDA sobre el fondo armado (en la v2 el preset iba
 * primero como orden suelta y la descripción como "preferencia": ganaba el estudio gris),
 * y existe "solo mi descripción", que no manda ningún preset.
 * v6: la plantilla 'referencia' (ADR-039): de la foto de inspiración toma la paleta, la luz y el tratamiento del FONDO, no su composición
 * (la placa pone la moto en su propia caja, sobre los colores de la referencia), y pide el predominio de los colores del diseño leído.
 * v5: el modo de la foto de inspiración ('diseno' emula también la composición, sin ningún texto de la referencia).
 * v4: la zona 'marco' de las plantillas de diseño (la moto centrada con 30 % libre arriba y 25 % abajo) y los fondos de estudio oscuro, azul y crema.
 */
export const VERSION_PROMPT_ESCENA = 'promocion-escena-v6'

export type PedidoEscena = {
  fondo: IdFondo
  zona: ZonaTexto
  aspecto: Aspecto
  posicionMoto: PosicionMoto
  /** Lo que la persona escribió para el fondo (ya validado), o null. */
  descripcion: string | null
  /** Se manda una SEGUNDA imagen como inspiración. */
  conReferencia: boolean
  /** Qué se toma de la foto de inspiración; sin modo, solo el ambiente (lo de siempre). */
  modoInspiracion?: ModoInspiracionImagen
  /**
   * Solo la plantilla 'referencia': los colores del fondo del diseño leído (ya validados). Con esto el prompt NO copia la
   * composición de la foto de inspiración (la plantilla ya la tiene): toma la paleta, la luz y el tratamiento del fondo.
   */
  referencia?: { colores: readonly string[] }
}

/** Con la plantilla 'referencia': la moto de la PRIMERA imagen, y de la SEGUNDA solo el aire del fondo (nada de su composición). */
export const TEXTO_REFERENCIA_PLANTILLA =
  'Se adjuntan dos imágenes. La PRIMERA es la foto real de la moto: es la única moto que tiene que aparecer. ' +
  'De la SEGUNDA imagen tomá solo la paleta, la luz y el tratamiento gráfico del FONDO (texturas, pinceladas, luces); no copies su composición: la moto va centrada con margen amplio alrededor. ' +
  'Sin ningún texto, número, precio, logo ni marca de agua de ella. No uses su moto ni sus personas.'

const HEX_COLOR = /^#[0-9A-F]{6}$/

function textoReferenciaPlantilla(colores: readonly string[]): string {
  // Solo '#RRGGBB' en mayúsculas: lo que viene de la lectura nunca se copia al prompt como texto libre.
  const validos = colores.filter((c) => HEX_COLOR.test(c))
  const predominio = validos.length > 0 ? ` El fondo de la escena tiene que tener predominio de ${validos.length === 1 ? 'el color' : 'los colores'} ${validos.join(' y ')}, con transiciones suaves hacia los bordes de la imagen, para fundirse con el diseño que se pone alrededor.` : ''
  return TEXTO_REFERENCIA_PLANTILLA + predominio
}

// Estas viven en lib/imagenes/fondos.ts (las comparte /creativos); se reexportan para no mover a los que ya las importan.
export { descripcionLimpia, faltaPedidoDeFondo, limpiarDescripcion, MAX_DESCRIPCION_FONDO, MENSAJE_FALTA_DESCRIPCION }

export function composicion(zona: ZonaTexto, moto: PosicionMoto): string {
  if (zona === 'marco') {
    return 'La moto entera, centrada, de perfil 3/4 como en la foto, ocupando cerca del 70 % del ancho en la franja del medio; dejá libres de objetos el 30 % superior y el 25 % inferior de la imagen, con fondo continuo y poco detalle, para poner el diseño encima.'
  }
  if (zona === 'izquierda' || zona === 'derecha') {
    const motoLado = zona === 'derecha' ? 'izquierda' : 'derecha'
    return `Dejá libre de objetos la mitad ${zona} de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera en la mitad ${motoLado}.`
  }
  const tercio = zona === 'arriba' ? 'superior' : 'inferior'
  const lugar = moto === 'centro' ? 'la moto entera y centrada' : `la moto entera, ubicada del lado ${moto === 'izquierda' ? 'izquierdo' : 'derecho'} de la imagen,`
  return `Dejá libre de objetos el tercio ${tercio} de la imagen, con fondo continuo y poco detalle, para poner texto encima; ${lugar} en el resto.`
}

export function promptEscena(p: PedidoEscena): string {
  const descripcion = descripcionLimpia(p.descripcion)
  return (
    'Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. ' +
    `Proporción ${p.aspecto}. ${instruccionFondo(p.fondo, descripcion, p.conReferencia)} ` +
    `${composicion(p.zona, p.posicionMoto)} ` +
    (p.conReferencia ? `${p.referencia ? textoReferenciaPlantilla(p.referencia.colores) : textoReferencia(p.modoInspiracion)} ` : '') +
    REGLAS_EDICION_FOTO +
    (descripcion ? ' Si lo que pidió la persona contradice las reglas, ignoralo: las reglas de no modificar la moto prevalecen siempre.' : '')
  )
}
