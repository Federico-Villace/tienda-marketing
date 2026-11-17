/**
 * Los textos que la copia fiel le pide a la IA. Puro y SIN node:crypto (lo importa también el navegador): salen de la promoción (precio del
 * dato cargado, nunca de un modelo) y de lo que la persona sacó de la placa (diseno.ocultos). El snapshot se guarda con la generación; su hash
 * (hash-textos.ts, solo servidor) dice si la imagen sigue siendo de estos textos.
 */

import { formatearPrecio } from '../datos.ts'
import { condicionPorDefecto, resolverDiseno } from '../diseno/defaults.ts'
import { OCULTABLES } from '../diseno/tipos.ts'
import type { FilaPromocion } from '../tipos.ts'
import { esVariasMotos } from '../varias/tipos.ts'
import type { MotoTexto, TextosCopia } from './tipos.ts'

/** Lo que entra en un renglón del prompt: sin los delimitadores «», comillas, saltos ni controles; espacios colapsados; hasta 60. */
export function limpiarTextoPrompt(s: string): string {
  return s
    .replace(/[«»"“”„‟‘’]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
}

const vacioANull = (t: string): string | null => (t.trim() === '' ? null : t.trim())

export function textosCopiaFiel(fila: Pick<FilaPromocion, 'modelo' | 'titular' | 'copy' | 'datos' | 'diseno' | 'motos_extra'>, o: { negocio: string; logoDibujable: boolean }): TextosCopia {
  // La misma resolución que las plantillas de diseño: la frase, la condición y el botón son los de siempre.
  const d = resolverDiseno(fila.diseno, 'impactante_textura', { modelo: fila.modelo, titular: fila.titular ?? fila.copy?.titular ?? '', datos: fila.datos })
  const fuera = (x: (typeof d.ocultos)[number]) => d.ocultos.includes(x)
  const sinLogos = fuera('logo999') || fuera('logoConcesionaria')
  const negocio = vacioANull(o.negocio)
  const logo = sinLogos ? 'ninguno' : o.logoDibujable ? 'real' : negocio ? 'nombre' : 'ninguno'
  const hayCondicion = d.condicion.texto.trim() !== '' || d.condicion.destacado.trim() !== ''
  // Varias motos (ADR-041): cada una con su modelo, su precio y su condición (la de su propia promo). Solo en ese caso existe la clave `motos`.
  const motos: MotoTexto[] | null = esVariasMotos(fila)
    ? [{ modelo: fila.modelo, precio: fila.datos.precio, promo: fila.datos.promo }, ...fila.motos_extra!].map((m) => {
        const c = condicionPorDefecto(m.promo)
        const texto = limpiarTextoPrompt(c.texto)
        const destacado = limpiarTextoPrompt(c.destacado)
        return {
          modelo: fuera('modelo') ? null : vacioANull(limpiarTextoPrompt(m.modelo)),
          precio: fuera('precio') || !d.mostrarPrecio ? null : formatearPrecio(m.precio),
          condicion: fuera('condicion') || (texto === '' && destacado === '') ? null : { texto, destacado },
        }
      })
    : null
  return {
    ...(motos ? { motos } : {}),
    modelo: motos || fuera('modelo') ? null : vacioANull(fila.modelo),
    precio: motos || fuera('precio') || !d.mostrarPrecio ? null : formatearPrecio(fila.datos.precio),
    condicion: motos || fuera('condicion') || !hayCondicion ? null : { texto: d.condicion.texto.trim(), destacado: d.condicion.destacado.trim() },
    frase: fuera('frase') ? null : vacioANull(d.frase),
    cta: fuera('cta') ? null : d.cta,
    lugar: fuera('lugar') ? null : vacioANull(fila.datos.lugar),
    negocio: logo === 'nombre' ? negocio : null,
    logo,
    ocultos: OCULTABLES.filter((x) => d.ocultos.includes(x)),
  }
}

/** Lo que va escrito, en orden, para mostrarlo en pantalla: "ROUSER 200 · $ 4.500.000 · 12 CUOTAS SIN INTERÉS · …". */
export function textosVisibles(t: TextosCopia): string[] {
  const condicion = (c: { texto: string; destacado: string } | null) => (c ? [c.texto, c.destacado].filter(Boolean).join(' ') : null)
  return [
    ...(t.motos ? t.motos.flatMap((m) => [m.modelo, m.precio, condicion(m.condicion)]) : [t.modelo, t.precio, condicion(t.condicion)]),
    t.frase,
    t.cta,
    t.lugar,
    t.negocio,
  ].filter((x): x is string => x !== null && x !== '')
}
