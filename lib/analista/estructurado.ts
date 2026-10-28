/**
 * El análisis v4: la forma que devuelve el modelo, su validación y lo que se arma
 * para mostrarlo. Nada de lo que el modelo escribe se muestra como DATO: los chips de
 * respaldo salen de los hechos del payload (hechos.ts) y cada ítem se marca
 * `verificado:false` si su texto trae una cifra que esos hechos no respaldan.
 *
 * Lo guardado es la forma del modelo (AnalisisV4) validada; `verificado`, `confianza`
 * y los datos se calculan al mostrar, así una edición se revalida sola contra la
 * entrada guardada (analisis.entrada).
 */

import { MARCAS, normalizarTexto } from '../datos/marcas.ts'
import { TIPOS_PROMO, type TipoPromo } from '../promocion/tipos.ts'
import type { EntradaAnalisis } from './entrada.ts'
import { FORMATOS_IDEA } from './esquema.ts'
import { indiceHechos, type Hecho } from './hechos.ts'

export type FormatoIdea = (typeof FORMATOS_IDEA)[number]

export type ItemV4 = { accion: string; porque: string; hechos: string[] }

export type IdeaV4 = {
  titulo: string
  marca: string | null
  modelo: string | null
  formato: FormatoIdea
  tipoPromo: TipoPromo
  momento: string
  porque: string
  hechos: string[]
}

export type AnalisisV4 = { resumen: string; hace: ItemV4[]; evita: ItemV4[]; proba: ItemV4[]; ideas: IdeaV4[] }

export const LIMITES_V4 = {
  resumen: 400,
  accion: 160,
  porque: 300,
  titulo: 80,
  momento: 80,
  modelo: 60,
  itemsPorLista: 3,
  ideas: 3,
  hechosPorItem: 3,
} as const

export type ModoValidacion = 'modelo' | 'edicion'

export type ResultadoV4 =
  | { ok: true; analisis: AnalisisV4; descartados: number }
  | { ok: false; errores: string[] }

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * `modelo`: tolerante (recorta largos y listas, descarta lo que cita hechos que no existen).
 * `edicion`: estricto (una persona tiene que ver el error, no que se le corte el texto).
 */
export function validarAnalisisV4(crudo: unknown, entrada: EntradaAnalisis, modo: ModoValidacion): ResultadoV4 {
  if (!esObjeto(crudo)) return { ok: false, errores: ['El análisis no tiene la forma esperada.'] }
  const errores: string[] = []
  const estricto = modo === 'edicion'
  const hechos = indiceHechos(entrada.hechos)
  const textosPayload = textosDelPayload(entrada)
  let descartados = 0

  /** Texto recortado; en modo edición, un largo excedido es error. null = inválido. */
  const campo = (valor: unknown, max: number, nombre: string): string | null => {
    if (typeof valor !== 'string' || valor.trim() === '') {
      errores.push(`Falta ${nombre}.`)
      return null
    }
    const t = valor.trim()
    if (t.length <= max) return t
    if (estricto) {
      errores.push(`${nombre} tiene más de ${max} caracteres.`)
      return null
    }
    return t.slice(0, max)
  }

  /** Ids citados: 1 a 3 y todos existentes. null = el ítem no se puede conservar. */
  const citados = (valor: unknown, nombre: string): string[] | null => {
    const ids = Array.isArray(valor) ? valor.filter((x): x is string => typeof x === 'string') : []
    const unicos = [...new Set(ids)]
    if (unicos.length === 0) {
      if (estricto) errores.push(`${nombre} tiene que citar al menos un dato.`)
      return null
    }
    if (unicos.some((id) => !hechos.has(id))) {
      if (estricto) errores.push(`${nombre} cita un dato que no existe en este análisis.`)
      return null
    }
    if (unicos.length > LIMITES_V4.hechosPorItem) {
      if (estricto) {
        errores.push(`${nombre} cita más de ${LIMITES_V4.hechosPorItem} datos.`)
        return null
      }
      return unicos.slice(0, LIMITES_V4.hechosPorItem)
    }
    return unicos
  }

  const lista = (valor: unknown, max: number, nombre: string): unknown[] => {
    if (valor === undefined || valor === null) return []
    if (!Array.isArray(valor)) {
      errores.push(`${nombre} tiene que ser una lista.`)
      return []
    }
    if (valor.length > max) {
      if (estricto) errores.push(`${nombre} tiene más de ${max} elementos.`)
      return valor.slice(0, max)
    }
    return valor
  }

  const items = (valor: unknown, nombre: string): ItemV4[] =>
    lista(valor, LIMITES_V4.itemsPorLista, nombre).flatMap((x, i): ItemV4[] => {
      const etiqueta = `${nombre} ${i + 1}`
      if (!esObjeto(x)) {
        errores.push(`${etiqueta} no tiene la forma esperada.`)
        return []
      }
      const antes = errores.length
      const accion = campo(x.accion, LIMITES_V4.accion, `La acción de ${etiqueta}`)
      const porque = campo(x.porque, LIMITES_V4.porque, `El porqué de ${etiqueta}`)
      const ids = citados(x.hechos, etiqueta)
      if (accion === null || porque === null || ids === null) {
        if (!estricto) {
          errores.length = antes
          descartados += 1
        }
        return []
      }
      return [{ accion, porque, hechos: ids }]
    })

  const ideas = (valor: unknown): IdeaV4[] =>
    lista(valor, LIMITES_V4.ideas, 'Las ideas').flatMap((x, i): IdeaV4[] => {
      const etiqueta = `La idea ${i + 1}`
      if (!esObjeto(x)) {
        errores.push(`${etiqueta} no tiene la forma esperada.`)
        return []
      }
      const antes = errores.length
      const titulo = campo(x.titulo, LIMITES_V4.titulo, `El título de ${etiqueta}`)
      const momento = campo(x.momento, LIMITES_V4.momento, `El momento de ${etiqueta}`)
      const porque = campo(x.porque, LIMITES_V4.porque, `El porqué de ${etiqueta}`)
      const ids = citados(x.hechos, etiqueta)
      const formato = FORMATOS_IDEA.find((f) => f === x.formato)
      const tipoPromo = TIPOS_PROMO.find((t) => t === x.tipoPromo)
      if (!formato) errores.push(`El formato de ${etiqueta} no es válido.`)
      if (!tipoPromo) errores.push(`El tipo de promoción de ${etiqueta} no es válido.`)
      if (titulo === null || momento === null || porque === null || ids === null || !formato || !tipoPromo) {
        if (!estricto) {
          errores.length = antes
          descartados += 1
        }
        return []
      }
      return [
        {
          titulo,
          marca: marcaDelFiltro(x.marca, entrada),
          modelo: modeloVisto(x.modelo, textosPayload),
          formato,
          tipoPromo,
          momento,
          porque,
          hechos: ids,
        },
      ]
    })

  const resumen = campo(crudo.resumen, LIMITES_V4.resumen, 'El resumen')
  const analisis = {
    resumen: resumen ?? '',
    hace: items(crudo.hace, 'Hacé'),
    evita: items(crudo.evita, 'Evitá'),
    proba: items(crudo.proba, 'Probá'),
    ideas: ideas(crudo.ideas),
  }

  if (estricto) {
    if (analisis.hace.length + analisis.evita.length + analisis.proba.length === 0 && errores.length === 0) {
      errores.push('Dejá al menos un ítem en Hacé, Evitá o Probá.')
    }
    return errores.length > 0 ? { ok: false, errores } : { ok: true, analisis, descartados }
  }
  // Modelo: lo que no se pudo conservar se descartó; solo es inválido si no quedó nada útil.
  if (resumen === null || analisis.hace.length + analisis.evita.length + analisis.proba.length === 0) {
    return { ok: false, errores: ['El Analista devolvió una respuesta inválida.'] }
  }
  return { ok: true, analisis, descartados }
}

/** Una marca del filtro (con su nombre canónico) o null: el modelo no puede traer marcas de afuera. */
function marcaDelFiltro(valor: unknown, entrada: EntradaAnalisis): string | null {
  if (typeof valor !== 'string') return null
  const buscada = normalizarTexto(valor)
  if (buscada === '') return null
  return entrada.filtro.marcas.find((m) => normalizarTexto(m) === buscada) ?? null
}

/** Textos y nombres que el modelo vio y de donde puede salir un modelo de moto. */
function textosCrudos(e: EntradaAnalisis): string[] {
  const p = e.destacados.publicaciones
  return [
    ...e.organico.mejores.map((x) => x.texto),
    ...e.organico.peores.map((x) => x.texto),
    ...p.mejores.map((x) => x.texto),
    ...p.peores.map((x) => x.texto),
    ...e.publicidad.campanias.map((c) => c.nombre),
    ...(e.destacados.campanias ? [...e.destacados.campanias.mejores, ...e.destacados.campanias.peores].map((c) => c.nombre) : []),
  ]
}

const textosDelPayload = (e: EntradaAnalisis): string => normalizarTexto(textosCrudos(e).join(' '))

/** El modelo de moto solo vale si aparece (normalizado) en lo que el modelo de lenguaje vio. */
function modeloVisto(valor: unknown, textos: string): string | null {
  if (typeof valor !== 'string') return null
  const m = valor.trim().slice(0, LIMITES_V4.modelo)
  const n = normalizarTexto(m)
  return n.length >= 2 && textos.includes(n) ? m : null
}

/**
 * Las cifras de un texto en formato es-AR: "1.840" → 1840, "4,2%" → 4,2, "ARS 2.300" → 2300.
 * El punto es de miles (solo si le siguen 3 dígitos), la coma es decimal.
 */
export function cifrasDe(texto: string): number[] {
  const coincidencias = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? []
  return coincidencias.map((c) => Number(c.replaceAll('.', '').replace(',', '.')))
}

/** Coincide con el valor del hecho dentro de 1%, o por redondeo a entero o a 1 decimal. */
const coincide = (cifra: number, valor: number): boolean => {
  const tolerancia = Math.max(Math.abs(valor) * 0.01, 0.05)
  return Math.abs(cifra - valor) <= tolerancia || cifra === Math.round(valor) || cifra === Math.round(valor * 10) / 10
}

/**
 * true = toda cifra del texto está respaldada por alguno de los hechos citados (valor o
 * muestra), es un número chico (días, cantidades ≤31), un año del período o un número que
 * ya figura en un texto o nombre del payload (modelos de moto, cuotas).
 */
export function verificarTexto(texto: string, citados: readonly Hecho[], entrada: EntradaAnalisis): boolean {
  const anios = new Set([entrada.periodo.desde, entrada.periodo.hasta].map((f) => Number(f.slice(0, 4))))
  // "350T", "TRK 502", "12 cuotas": un número que ya está en un texto o nombre del payload no lo inventó el modelo.
  const delPayload = new Set(textosCrudos(entrada).flatMap(cifrasDe))
  const respaldos = citados.flatMap((h) => (h.muestra ? [h.valor, h.muestra.cantidad] : [h.valor]))
  return cifrasDe(texto).every(
    (c) => (Number.isInteger(c) && c <= 31) || anios.has(c) || delPayload.has(c) || respaldos.some((v) => coincide(c, v)),
  )
}

export type Confianza = 'alta' | 'media' | 'baja'

/** Umbrales de muestra por unidad: [alta, media]. Debajo de "media" es baja. */
const UMBRALES_CONFIANZA: Record<string, readonly [number, number]> = {
  publicaciones: [10, 5],
  resultados: [30, 10],
  clics: [300, 100],
  impresiones: [50000, 10000],
}

const ORDEN: readonly Confianza[] = ['baja', 'media', 'alta']

/**
 * La confianza la calcula el servidor con la muestra MÍNIMA de los hechos citados
 * (no la dice el modelo). Un hecho sin muestra o con una unidad sin umbral no la baja;
 * si ninguno tiene umbral, queda en "media": sin criterio no se afirma "alta".
 */
export function confianzaDe(citados: readonly Hecho[]): Confianza {
  const niveles = citados.flatMap((h): Confianza[] => {
    const u = h.muestra ? UMBRALES_CONFIANZA[h.muestra.unidad] : undefined
    if (!h.muestra || !u) return []
    return [h.muestra.cantidad >= u[0] ? 'alta' : h.muestra.cantidad >= u[1] ? 'media' : 'baja']
  })
  if (niveles.length === 0) return 'media'
  return niveles.reduce((peor, n) => (ORDEN.indexOf(n) < ORDEN.indexOf(peor) ? n : peor))
}

export type ItemVista = ItemV4 & {
  /** Los hechos citados, con el valor del PAYLOAD. */
  readonly datos: readonly Hecho[]
  readonly confianza: Confianza
  readonly verificado: boolean
}

export type IdeaVista = IdeaV4 &
  Omit<ItemVista, keyof ItemV4> & {
    readonly marcaId: string | null
    /** Historia y reel son verticales; el resto, feed vertical. */
    readonly aspecto: '9:16' | '4:5'
  }

export type AnalisisV4Vista = {
  readonly resumen: string
  readonly hace: readonly ItemVista[]
  readonly evita: readonly ItemVista[]
  readonly proba: readonly ItemVista[]
  readonly ideas: readonly IdeaVista[]
}

export function enriquecer(a: AnalisisV4, entrada: EntradaAnalisis): AnalisisV4Vista {
  const indice = indiceHechos(entrada.hechos)
  const respaldo = (ids: readonly string[], textos: readonly string[]) => {
    const datos = ids.flatMap((id) => indice.get(id) ?? [])
    return {
      datos,
      confianza: confianzaDe(datos),
      verificado: textos.every((t) => verificarTexto(t, datos, entrada)),
    }
  }
  const item = (x: ItemV4): ItemVista => ({ ...x, ...respaldo(x.hechos, [x.accion, x.porque]) })
  return {
    resumen: a.resumen,
    hace: a.hace.map(item),
    evita: a.evita.map(item),
    proba: a.proba.map(item),
    ideas: a.ideas.map((x) => ({
      ...x,
      ...respaldo(x.hechos, [x.titulo, x.momento, x.porque]),
      marcaId: MARCAS.find((m) => m.nombre === x.marca)?.id ?? null,
      aspecto: x.formato === 'reel' || x.formato === 'historia' ? '9:16' : '4:5',
    })),
  }
}

/** El texto plano que lee el Estratega (y cualquiera que espere texto): nunca el JSON. */
export function aTextoPlano(a: AnalisisV4): string {
  const bloque = (titulo: string, xs: readonly ItemV4[]) =>
    xs.length === 0 ? [] : [`${titulo}:`, ...xs.map((x) => `- ${x.accion}. ${x.porque}`)]
  const ideas =
    a.ideas.length === 0
      ? []
      : [
          'Ideas para armar:',
          ...a.ideas.map((x) => {
            const quien = [x.marca, x.modelo].filter(Boolean).join(' ')
            return `- ${x.titulo} (${[quien, x.formato, x.tipoPromo === 'ninguna' ? '' : x.tipoPromo, x.momento].filter(Boolean).join(' · ')}). ${x.porque}`
          }),
        ]
  return [`Resumen: ${a.resumen}`, ...bloque('Hacé', a.hace), ...bloque('Evitá', a.evita), ...bloque('Probá', a.proba), ...ideas].join('\n')
}
