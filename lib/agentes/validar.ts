/**
 * Piezas comunes de los validadores de los agentes (Estratega, Contenidista).
 *
 * Forma exacta (sin claves de más), rangos y textos. Los mensajes van en
 * español porque llegan a la UI (422).
 */

export type Validacion<T, K extends string> = ({ ok: true } & Record<K, T>) | { ok: false; errores: string[] }

export const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
// 8 o más dígitos seguidos (con separadores típicos de teléfono): "25 a 40 años" no entra.
export const TELEFONO = /(?:\+?\d[\s.\-()]*){8,}/

export type Obj = Record<string, unknown>
export const esObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x)

const MAX_TEXTO = 500

export class Ctx {
  errores: string[] = []
  /** Nombre de la raíz: sus campos se informan sin prefijo ("hook", no "pieza.hook"). */
  readonly raiz: string
  constructor(raiz = 'plan') {
    this.raiz = raiz
  }

  err(m: string) {
    this.errores.push(m)
  }

  /** Objeto con exactamente estas claves; devuelve null si no es válido. */
  objeto(x: unknown, ruta: string, claves: readonly string[]): Obj | null {
    if (!esObj(x)) {
      this.err(`"${ruta}" debe ser un objeto.`)
      return null
    }
    const nombre = (k: string) => (ruta === this.raiz ? k : `${ruta}.${k}`)
    let ok = true
    for (const k of claves) {
      if (!(k in x)) {
        this.err(`Falta el campo "${nombre(k)}".`)
        ok = false
      }
    }
    for (const k of Object.keys(x)) {
      if (!claves.includes(k)) {
        this.err(`El campo "${nombre(k)}" no está permitido.`)
        ok = false
      }
    }
    return ok ? x : null
  }

  texto(x: unknown, ruta: string, min: number, max: number): string {
    const t = typeof x === 'string' ? x.trim() : ''
    if (typeof x !== 'string' || t.length < min || t.length > max) {
      this.err(`"${ruta}" debe ser un texto de ${min === 0 ? 'hasta' : `${min} a`} ${max} caracteres.`)
    }
    return t
  }

  textoONull(x: unknown, ruta: string, max = MAX_TEXTO): string | null {
    return x === null ? null : this.texto(x, ruta, 1, max)
  }

  lista(x: unknown, ruta: string, min: number, max: number): unknown[] {
    if (!Array.isArray(x) || x.length < min || x.length > max) {
      this.err(`"${ruta}" debe tener entre ${min} y ${max} elementos.`)
      return []
    }
    return x
  }

  entero(x: unknown, ruta: string, min: number, max: number): number {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) {
      this.err(`"${ruta}" debe ser un entero entre ${min} y ${max}.`)
      return min
    }
    return x
  }
}
