/**
 * Limpieza del texto libre que escribe una persona y que termina DENTRO de un prompt
 * (descripción del fondo, pedido de un cambio). Una sola línea, sin los delimitadores «»
 * que usan los prompts y sin caracteres de control o invisibles.
 */

/** Controles y separadores invisibles (espacios de ancho cero, marcas de dirección, LS/PS, BOM). */
const INVISIBLES = new RegExp(String.raw`[\u0000-\u001f\u007f-\u009f​-‏  ﻿]`, 'g')

export function limpiarDescripcion(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/[«»]/g, ' ')
    .replace(INVISIBLES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
