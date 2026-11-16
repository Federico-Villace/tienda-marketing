/**
 * Saca el objeto JSON del texto que devolvió el modelo. Ese texto es ENTRADA NO CONFIABLE: acá solo se localiza y se
 * parsea (JSON.parse, nunca eval); el contenido lo cierra después `leerLectura`. Tolera comillas de código y texto
 * alrededor, que los modelos agregan aunque se les pida solo el JSON. Puro.
 */

/** Una lectura de verdad pesa ~2 KB: más que esto no es una lectura (y no se recorre carácter por carácter). */
const MAX_CARACTERES = 100_000

/** Del primer "{" al "}" que lo cierra, respetando strings y escapes. null si no cierra. */
function objetoBalanceado(t: string): string | null {
  const inicio = t.indexOf('{')
  if (inicio < 0) return null
  let profundidad = 0
  let enString = false
  let escapado = false
  for (let i = inicio; i < t.length; i++) {
    const c = t[i]!
    if (enString) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enString = false
      continue
    }
    if (c === '"') enString = true
    else if (c === '{') profundidad++
    else if (c === '}' && --profundidad === 0) return t.slice(inicio, i + 1)
  }
  return null
}

export function extraerJson(texto: string): Record<string, unknown> | null {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > MAX_CARACTERES) return null
  const candidato = objetoBalanceado(texto)
  if (candidato === null) return null
  try {
    const x: unknown = JSON.parse(candidato)
    return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
  } catch {
    return null
  }
}
