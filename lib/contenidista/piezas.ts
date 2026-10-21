/**
 * validarPiezas / validarPieza: la ÚNICA puerta de una pieza, venga del LLM o de
 * una edición humana (mismo patrón que validarPlan). Forma exacta, límites de
 * Meta y reglas de negocio; los mensajes van en español porque llegan a la UI.
 *
 * Solo el origen 'agente' tiene que respaldar sus montos con el plan y las notas
 * (el humano es la fuente de lo que escribe), y solo la tanda completa controla
 * que se pidieron justo las piezas del calendario.
 */

import { Ctx, EMAIL, TELEFONO, type Validacion } from '../agentes/validar.ts'
import { MARCAS } from '../datos/marcas.ts'
import { fechaIso } from '../estratega/brief.ts'
import { LIMITES, textoPublicado } from './limites.ts'
import { CAMPOS_TEXTO, MONTO, MARCADOR_PRECIO, montosNoRespaldados } from './montos.ts'
import { FORMATOS, PLATAFORMAS, type ContextoSemana, type Pieza } from './tipos.ts'

const CLAVES = [
  'marca', 'plataforma', 'formato', 'fecha', 'hook', 'copy', 'hashtags', 'cta', 'guion', 'briefVisual', 'altText', 'ideaOrigen',
] as const
const HASHTAG = /^#[\p{L}\p{N}_]{1,60}$/u
const HASHTAG_EN_COPY = /#[\p{L}\p{N}_]+/gu
const MENCION = /(?<![\w.])@([A-Za-z0-9._]{1,30})/g
const WHATSAPP = /whats\s?app/i

type Opciones =
  | { origen: 'agente' }
  | { origen: 'edicion'; base: Pieza }

/** Las filas del calendario de la semana. */
const filasDe = (ctx: ContextoSemana) => ctx.plan.calendario.find((s) => s.semana === ctx.semana)?.piezas ?? []

function validarUna(c: Ctx, x: unknown, ruta: string, ctx: ContextoSemana, op: Opciones): Pieza | null {
  const r = c.objeto(x, ruta, CLAVES)
  if (!r) return null
  const en = (k: string) => (ruta === c.raiz ? k : `${ruta}.${k}`)
  const antes = c.errores.length

  const marca = typeof r.marca === 'string' ? r.marca.trim() : ''
  if (!ctx.plan.marcas.includes(marca) || !MARCAS.some((m) => m.nombre === marca)) {
    c.err(`La marca de "${en('marca')}" debe ser una de las del plan.`)
  }
  const plataforma = r.plataforma as Pieza['plataforma']
  if (!(PLATAFORMAS as readonly unknown[]).includes(plataforma)) c.err(`La plataforma de "${en('plataforma')}" debe ser instagram o facebook.`)
  const formato = r.formato as Pieza['formato']
  if (!(FORMATOS as readonly unknown[]).includes(formato)) c.err(`El formato de "${en('formato')}" no es válido.`)

  const fecha = typeof r.fecha === 'string' ? r.fecha.trim() : ''
  const f = fechaIso(fecha)
  if (f === null) c.err(`"${en('fecha')}" debe ser una fecha válida (AAAA-MM-DD).`)
  else if (f < fechaIso(ctx.desde)! || f > fechaIso(ctx.hasta)!) {
    c.err(`"${en('fecha')}" debe caer entre ${ctx.desde} y ${ctx.hasta}, dentro de la semana ${ctx.semana}.`)
  }

  const esHistoria = formato === 'historia'
  const hook = c.texto(r.hook, en('hook'), 1, LIMITES.HOOK)
  const cta = c.texto(r.cta, en('cta'), 1, LIMITES.CTA)
  const briefVisual = c.texto(r.briefVisual, en('briefVisual'), 1, LIMITES.BRIEF_VISUAL)
  // Una historia no tiene caption: el texto va en el hook y en el brief visual.
  const copy = c.texto(r.copy, en('copy'), esHistoria ? 0 : 1, LIMITES.COPY)
  if (esHistoria && copy !== '') c.err(`Una historia no lleva copy: "${en('copy')}" debe estar vacío.`)

  const hashtags = c.lista(r.hashtags, en('hashtags'), 0, LIMITES.HASHTAGS).map((h, i) => {
    const t = typeof h === 'string' ? h.trim() : ''
    if (!HASHTAG.test(t)) c.err(`"${en('hashtags')}[${i}]" debe empezar con # y tener solo letras, números o guiones bajos.`)
    return t
  })
  if (esHistoria && hashtags.length > 0) c.err(`Una historia no lleva hashtags: "${en('hashtags')}" debe estar vacío.`)
  const enCopy = copy.match(HASHTAG_EN_COPY)?.length ?? 0
  if (hashtags.length + enCopy > LIMITES.HASHTAGS) c.err(`Hay más de ${LIMITES.HASHTAGS} hashtags entre la lista y el copy.`)
  if (copy !== '' && textoPublicado({ copy, hashtags }).length > LIMITES.COPY) {
    c.err(`El copy con los hashtags pasa de ${LIMITES.COPY} caracteres.`)
  }

  const menciones = [...copy.matchAll(MENCION)].map((m) => m[1]!.replace(/\.+$/, ''))
  if (menciones.length > LIMITES.MENCIONES) c.err(`Hay más de ${LIMITES.MENCIONES} menciones (@) en el copy.`)
  for (const m of new Set(menciones)) {
    if (!MARCAS.some((x) => x.usuarioIg === m)) c.err(`La mención @${m} no es una cuenta de las marcas.`)
  }

  // guion solo en reel y video; altText solo en imagen y carrusel; en el resto, null.
  const lleva = (clave: 'guion' | 'altText', formatos: readonly string[], max: number) =>
    formatos.includes(formato)
      ? c.texto(r[clave], en(clave), 1, max)
      : r[clave] === null
        ? null
        : (c.err(`"${en(clave)}" debe ser null en formato ${String(formato)}.`), null)
  const guion = lleva('guion', ['reel', 'video'], LIMITES.GUION)
  const altText = lleva('altText', ['imagen', 'carrusel'], LIMITES.ALT)

  const ideaOrigen = c.texto(r.ideaOrigen, en('ideaOrigen'), 1, 500)

  const pieza: Pieza = { marca, plataforma, formato, fecha, hook, copy, hashtags, cta, guion, briefVisual, altText, ideaOrigen }

  // Sin email ni teléfono en ningún texto. Los montos se sacan antes de buscar teléfonos:
  // "$ 12.500.000" tiene 8 dígitos y no es un número de contacto.
  const textos = [...CAMPOS_TEXTO.map((k) => pieza[k]), ...hashtags].filter((t): t is string => typeof t === 'string')
  if (textos.some((t) => EMAIL.test(t) || TELEFONO.test(t.replace(MONTO, ' ')))) {
    c.err('Las piezas no pueden llevar emails ni teléfonos: la gente escribe por mensaje.')
  }

  if (op.origen === 'agente') {
    const sinRespaldo = textos.flatMap((t) => montosNoRespaldados(t, ctx.fuente))
    if (sinRespaldo.length > 0) c.err(`Hay montos que no están en el plan ni en las notas: ${sinRespaldo.join(', ')}. Usá ${MARCADOR_PRECIO}.`)
    if (textos.some((t) => WHATSAPP.test(t)) && !WHATSAPP.test(ctx.fuente)) c.err('Se menciona WhatsApp y no figura en el plan ni en las notas.')
  } else {
    // Una edición no cambia qué pieza es: solo su contenido.
    for (const k of ['plataforma', 'formato', 'ideaOrigen'] as const) {
      if (pieza[k] !== op.base[k]) c.err(`"${en(k)}" no se puede cambiar al editar.`)
    }
  }

  return c.errores.length === antes ? pieza : null
}

/** Una tanda entera del modelo: `{ piezas: [...] }` con justo lo que pidió la semana. */
export function validarPiezas(x: unknown, ctx: ContextoSemana, op: { origen: 'agente' }): Validacion<Pieza[], 'piezas'> {
  const c = new Ctx('tanda')
  const r = c.objeto(x, 'tanda', ['piezas'])
  if (!r) return { ok: false, errores: c.errores }

  const piezas = c
    .lista(r.piezas, 'piezas', 1, LIMITES.PIEZAS_POR_SEMANA)
    .map((p, i) => validarUna(c, p, `piezas[${i}]`, ctx, op))

  // Multiconjunto (plataforma, formato) == filas × cantidad, y la idea sale de una fila igual.
  const filas = filasDe(ctx)
  const pedidas = new Map<string, number>()
  for (const f of filas) pedidas.set(`${f.plataforma}|${f.formato}`, (pedidas.get(`${f.plataforma}|${f.formato}`) ?? 0) + f.cantidad)
  const recibidas = new Map<string, number>()
  for (const p of piezas) {
    if (p) recibidas.set(`${p.plataforma}|${p.formato}`, (recibidas.get(`${p.plataforma}|${p.formato}`) ?? 0) + 1)
    if (p && !filas.some((f) => f.plataforma === p.plataforma && f.formato === p.formato && f.idea === p.ideaOrigen)) {
      c.err(`La ideaOrigen "${p.ideaOrigen}" no es una idea de ${p.plataforma} ${p.formato} de la semana ${ctx.semana}.`)
    }
  }
  const claves = new Set([...pedidas.keys(), ...recibidas.keys()])
  if ([...claves].some((k) => (pedidas.get(k) ?? 0) !== (recibidas.get(k) ?? 0)) || piezas.length !== [...pedidas.values()].reduce((a, b) => a + b, 0)) {
    c.err(`Las piezas no coinciden con las que pide la semana ${ctx.semana}: hay que escribir exactamente las del plan.`)
  }

  if (c.errores.length > 0) return { ok: false, errores: c.errores }
  return { ok: true, piezas: piezas as Pieza[] }
}

/** Una pieza editada por una persona. `base` es la versión que edita. */
export function validarPieza(x: unknown, ctx: ContextoSemana, op: { origen: 'edicion'; base: Pieza }): Validacion<Pieza, 'pieza'> {
  const c = new Ctx('pieza')
  const p = validarUna(c, x, 'pieza', ctx, op)
  if (!p || c.errores.length > 0) return { ok: false, errores: c.errores }
  return { ok: true, pieza: p }
}
