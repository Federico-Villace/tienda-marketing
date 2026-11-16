/**
 * Compara lo que la IA debía escribir (los textos esperados, que NO se le mostraron al verificador) con lo que el verificador LEYÓ. Puro y
 * determinístico: el veredicto lo calcula el servidor, nunca un modelo. Un texto de la imagen es un dato, jamás una instrucción.
 *
 * Bloquea (la variante no se puede usar): el precio, el modelo y la condición mal, faltantes o ilegibles; frase, botón, lugar y nombre
 * escritos DISTINTO; cualquier monto que sobre; cualquier número que no se pidió; y lo que la persona SACÓ de la placa si aparece.
 * Solo avisa: un texto blando que falta o no se lee, un texto sin números de más, un logo dibujado por la IA debajo del real.
 */

import type { CampoTexto, Comparacion, Diferencia, Lectura, RolLeido, TextoLeido, TextosCopia } from './tipos.ts'

export const VERSION_COMPARACION = 'copia-comparacion-v1'

/** Mayúsculas, sin acentos, comillas y guiones tipográficos a ASCII, espacios colapsados y sin puntuación final. */
export function canon(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛´`]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!¡¿?:]+$/u, '')
    .trim()
}
const canonAlnum = (s: string): string => canon(s).replace(/[^A-Z0-9]/g, '')
/** El precio no admite que cambie ningún separador ni dígito ni símbolo: solo se ignoran los espacios. */
const canonPrecio = (s: string): string => s.replace(/\s+/g, '').toUpperCase()

const DINERO = /(US\$|U\$S|USD|\$)\s?\d|\d{1,3}(\.\d{3})+/
const tieneDigito = (s: string): boolean => /\d/.test(s)
const esDinero = (t: TextoLeido): boolean => t.rol === 'precio' || DINERO.test(t.texto)

/** Los roles que el verificador asigna a lo que la persona puede sacar (los logos son 'marca'). */
const ROL_DE: Partial<Record<CampoTexto, RolLeido>> = { modelo: 'modelo', condicion: 'condicion', frase: 'frase', cta: 'cta', lugar: 'lugar' }

type Estado = { t: TextoLeido[]; usado: boolean[] }

const libres = (e: Estado): number[] => e.t.map((_, i) => i).filter((i) => !e.usado[i])

/** Un texto libre (o 2 o 3 renglones libres seguidos, unidos) que sea igual a `buscado` según `canonico`. */
function buscarIgual(e: Estado, buscado: string, canonico: (s: string) => string, preferido?: RolLeido): { indices: number[]; dudoso: boolean } | null {
  const objetivo = canonico(buscado)
  const orden = libres(e).sort((a, b) => Number(e.t[b]!.rol === preferido) - Number(e.t[a]!.rol === preferido) || a - b)
  let dudoso: { indices: number[]; dudoso: boolean } | null = null
  const probar = (indices: number[]) => {
    if (canonico(indices.map((i) => e.t[i]!.texto).join(' ')) !== objetivo) return null
    return { indices, dudoso: indices.some((i) => e.t[i]!.dudoso) }
  }
  for (const i of orden) {
    const r = probar([i])
    if (r && !r.dudoso) return r
    if (r && !dudoso) dudoso = r
  }
  // Un bloque que el verificador partió en renglones: 2 o 3 textos libres CONSECUTIVOS.
  for (const largo of [2, 3]) {
    for (let a = 0; a + largo <= e.t.length; a++) {
      const indices = Array.from({ length: largo }, (_, k) => a + k)
      if (indices.some((i) => e.usado[i])) continue
      const r = probar(indices)
      if (r && !r.dudoso) return r
      if (r && !dudoso) dudoso = r
    }
  }
  return dudoso
}

const consumir = (e: Estado, indices: number[]) => indices.forEach((i) => (e.usado[i] = true))
const primeroConRol = (e: Estado, rol: RolLeido): number | null => libres(e).find((i) => e.t[i]!.rol === rol) ?? null

export function compararTextos(esp: TextosCopia, leido: Lectura): Comparacion {
  const e: Estado = { t: leido.textos, usado: leido.textos.map(() => false) }
  const diferencias: Diferencia[] = []
  const avisos: Diferencia[] = []
  const bloquea = (d: Diferencia) => diferencias.push(d)
  const avisa = (d: Diferencia) => avisos.push(d)
  const fuera = (o: (typeof esp.ocultos)[number]) => esp.ocultos.includes(o)
  const logosFuera = fuera('logo999') || fuera('logoConcesionaria')

  const condicionTexto = esp.condicion ? [esp.condicion.texto, esp.condicion.destacado].filter(Boolean).join(' ') : null
  const esperaAlgo = [esp.modelo, esp.precio, esp.condicion, esp.frase, esp.cta, esp.lugar, esp.negocio].some((x) => x !== null)

  // Nada leído: si se esperaba algo, el verificador no vio nada (placa vacía o lectura rota): bloquea. Si no se esperaba nada, es una placa sin texto.
  if (leido.textos.length === 0) {
    if (!esperaAlgo) return { ok: true, avisos: [] }
    const falta = (campo: CampoTexto, x: string | null) => x !== null && bloquea({ campo, motivo: 'falta', esperado: x, leido: null })
    falta('modelo', esp.modelo)
    falta('precio', esp.precio)
    falta('condicion', condicionTexto)
    falta('frase', esp.frase)
    falta('cta', esp.cta)
    falta('lugar', esp.lugar)
    falta('negocio', esp.negocio)
    return { ok: false, diferencias, avisos }
  }

  // ── PRECIO ──────────────────────────────────────────────────────────────────────────────────────
  const candidatosDinero = () => libres(e).filter((i) => esDinero(e.t[i]!))
  if (esp.precio !== null) {
    const buscado = canonPrecio(esp.precio)
    const iguales = candidatosDinero().filter((i) => canonPrecio(e.t[i]!.texto) === buscado)
    const firmes = iguales.filter((i) => !e.t[i]!.dudoso)
    if (firmes.length > 0) consumir(e, iguales)
    else if (iguales.length > 0) {
      consumir(e, iguales)
      bloquea({ campo: 'precio', motivo: 'ilegible', esperado: esp.precio, leido: e.t[iguales[0]!]!.texto })
    } else {
      const otros = candidatosDinero()
      const cual = otros.find((i) => e.t[i]!.rol === 'precio') ?? otros[0]
      if (cual === undefined) bloquea({ campo: 'precio', motivo: 'falta', esperado: esp.precio, leido: null })
      else {
        consumir(e, [cual])
        bloquea({ campo: 'precio', motivo: 'distinto', esperado: esp.precio, leido: e.t[cual]!.texto })
      }
    }
  }
  // Todo otro monto bloquea: sin precio esperado (sacado o no mostrado) cualquier monto sobra; con precio, uno distinto sobra.
  for (const i of candidatosDinero()) {
    consumir(e, [i])
    bloquea({ campo: fuera('precio') ? 'precio' : 'otro', motivo: 'sobra', esperado: null, leido: e.t[i]!.texto })
  }

  // ── MODELO ──────────────────────────────────────────────────────────────────────────────────────
  if (esp.modelo !== null) {
    const r = buscarIgual(e, esp.modelo, canonAlnum, 'modelo')
    if (r) {
      consumir(e, r.indices)
      if (r.dudoso) bloquea({ campo: 'modelo', motivo: 'ilegible', esperado: esp.modelo, leido: r.indices.map((i) => e.t[i]!.texto).join(' ') })
    } else {
      const i = primeroConRol(e, 'modelo')
      if (i === null) bloquea({ campo: 'modelo', motivo: 'falta', esperado: esp.modelo, leido: null })
      else {
        consumir(e, [i])
        bloquea({ campo: 'modelo', motivo: 'distinto', esperado: esp.modelo, leido: e.t[i]!.texto })
      }
    }
  }

  // ── CONDICIÓN (lleva números: bloquea) ───────────────────────────────────────────────────────────
  if (esp.condicion !== null && condicionTexto !== null) {
    let hallado = buscarIgual(e, condicionTexto, canon, 'condicion')
    if (!hallado && esp.condicion.destacado) {
      // Dos estilos: el texto y la pastilla destacada, como dos textos.
      const a = buscarIgual(e, esp.condicion.texto, canon, 'condicion')
      if (a) {
        consumir(e, a.indices)
        const b = buscarIgual(e, esp.condicion.destacado, canon, 'condicion')
        if (b) hallado = { indices: [...a.indices, ...b.indices], dudoso: a.dudoso || b.dudoso }
        else a.indices.forEach((i) => (e.usado[i] = false))
      }
    }
    if (hallado) {
      consumir(e, hallado.indices)
      if (hallado.dudoso) bloquea({ campo: 'condicion', motivo: 'ilegible', esperado: condicionTexto, leido: hallado.indices.map((i) => e.t[i]!.texto).join(' ') })
    } else {
      // Lo que hubiera de la condición (hasta dos renglones) se muestra junto.
      const mios = libres(e).filter((k) => e.t[k]!.rol === 'condicion').slice(0, 2)
      if (mios.length === 0) bloquea({ campo: 'condicion', motivo: 'falta', esperado: condicionTexto, leido: null })
      else {
        consumir(e, mios)
        bloquea({ campo: 'condicion', motivo: 'distinto', esperado: condicionTexto, leido: mios.map((k) => e.t[k]!.texto).join(' ') })
      }
    }
  }

  // ── FRASE, BOTÓN, LUGAR, NEGOCIO: iguales por canon; distinto bloquea; ausente o dudoso solo avisa ─────
  const blando = (campo: CampoTexto, esperadoTxt: string | null, rol: RolLeido) => {
    if (esperadoTxt === null) return
    const r = buscarIgual(e, esperadoTxt, canon, rol)
    if (r) {
      consumir(e, r.indices)
      if (r.dudoso) avisa({ campo, motivo: 'ilegible', esperado: esperadoTxt, leido: r.indices.map((i) => e.t[i]!.texto).join(' ') })
      return
    }
    const i = primeroConRol(e, rol)
    if (i === null) avisa({ campo, motivo: 'falta', esperado: esperadoTxt, leido: null })
    else {
      consumir(e, [i])
      bloquea({ campo, motivo: 'distinto', esperado: esperadoTxt, leido: e.t[i]!.texto })
    }
  }
  blando('frase', esp.frase, 'frase')
  blando('cta', esp.cta, 'cta')
  blando('lugar', esp.lugar, 'lugar')
  blando('negocio', esp.negocio, 'marca')

  // ── SOBRANTES: lo que quedó sin consumir ───────────────────────────────────────────────────────────
  for (const i of libres(e)) {
    const t = e.t[i]!
    const sacado = (Object.entries(ROL_DE) as [CampoTexto, RolLeido][]).find(([campo, rol]) => rol === t.rol && (esp.ocultos as string[]).includes(campo))
    if (sacado) bloquea({ campo: sacado[0], motivo: 'sobra', esperado: null, leido: t.texto })
    else if (t.rol === 'marca' && logosFuera) bloquea({ campo: 'negocio', motivo: 'sobra', esperado: null, leido: t.texto })
    else if (tieneDigito(t.texto) && t.rol !== 'marca') bloquea({ campo: 'otro', motivo: 'sobra', esperado: null, leido: t.texto })
    else avisa({ campo: t.rol === 'marca' ? 'negocio' : 'otro', motivo: 'sobra', esperado: null, leido: t.texto })
  }

  return diferencias.length === 0 ? { ok: true, avisos } : { ok: false, diferencias, avisos }
}

const NOMBRE: Record<CampoTexto, string> = { modelo: 'Modelo', precio: 'Precio', condicion: 'Condición', frase: 'Frase', cta: 'Botón', lugar: 'Lugar', negocio: 'Nombre del negocio', otro: 'Texto' }

/** La frase que ve la persona. `avisoLogo`: un 'sobra' del nombre/logo que NO bloquea (la IA dibujó un logo debajo del real). */
export function mensajeDiferencia(d: Diferencia, o: { avisoLogo?: boolean } = {}): string {
  const campo = NOMBRE[d.campo]
  switch (d.motivo) {
    case 'distinto':
      return `${campo}: dice «${d.leido ?? ''}», tenía que decir «${d.esperado ?? ''}»`
    case 'falta':
      return `${campo}: no aparece «${d.esperado ?? ''}»`
    case 'ilegible':
      return `${campo}: no se lee con claridad`
    case 'sobra':
      if (o.avisoLogo && d.campo === 'negocio') return `La IA dibujó un logo («${d.leido ?? ''}»): queda tapado por el real`
      return d.campo === 'otro' ? `Apareció «${d.leido ?? ''}», que no pediste` : `Apareció «${d.leido ?? ''}», que sacaste de la placa`
  }
}
