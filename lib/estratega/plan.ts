/**
 * validarPlan: la ÚNICA puerta de un plan, venga del LLM o de una edición humana.
 *
 * Forma exacta (sin claves de más), rangos y reglas de negocio. No se confía en
 * lo que valida strict de OpenAI: acá se controla todo. Los mensajes van en
 * español porque llegan a la UI (422).
 */

import { fechaIso } from './brief.ts'
import { FORMATOS, NIVELES_PRESUPUESTO, PLATAFORMAS, type Brief, type Plan, type Validacion } from './tipos.ts'

const MAX_TEXTO = 500
const MAX_CORTO = 300
const MAX_IDEA = 280
const DIA_MS = 24 * 60 * 60 * 1000
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
// 8 o más dígitos seguidos (con separadores típicos de teléfono): "25 a 40 años" no entra.
const TELEFONO = /(?:\+?\d[\s.\-()]*){8,}/

type Obj = Record<string, unknown>
const esObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x)

class Ctx {
  errores: string[] = []
  err(m: string) {
    this.errores.push(m)
  }

  /** Objeto con exactamente estas claves; devuelve null si no es válido. */
  objeto(x: unknown, ruta: string, claves: readonly string[]): Obj | null {
    if (!esObj(x)) {
      this.err(`"${ruta}" debe ser un objeto.`)
      return null
    }
    let ok = true
    for (const k of claves) {
      if (!(k in x)) {
        this.err(`Falta el campo "${ruta === 'plan' ? k : `${ruta}.${k}`}".`)
        ok = false
      }
    }
    for (const k of Object.keys(x)) {
      if (!claves.includes(k)) {
        this.err(`El campo "${ruta === 'plan' ? k : `${ruta}.${k}`}" no está permitido.`)
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

  textoONull(x: unknown, ruta: string): string | null {
    return x === null ? null : this.texto(x, ruta, 1, MAX_TEXTO)
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

export function validarPlan(x: unknown, brief: Brief): Validacion<Plan, 'plan'> {
  const c = new Ctx()
  const r = c.objeto(x, 'plan', [
    'objetivo', 'mensajeCentral', 'publico', 'marcas', 'presupuesto', 'ventana',
    'canales', 'calendario', 'kpis', 'fundamentos', 'supuestos',
  ])
  if (!r) return { ok: false, errores: c.errores }

  const objetivo = c.texto(r.objetivo, 'objetivo', 1, MAX_CORTO)
  const mensajeCentral = c.texto(r.mensajeCentral, 'mensajeCentral', 1, MAX_CORTO)

  // Público: solo texto. Nada de listas de contactos ni datos personales.
  const sinContacto = (t: string, ruta: string) => {
    if (EMAIL.test(t) || TELEFONO.test(t)) c.err(`El público es solo texto: "${ruta}" parece un email o un teléfono.`)
  }
  const publico = { descripcion: '', segmentos: [] as Plan['publico']['segmentos'] }
  const pu = c.objeto(r.publico, 'publico', ['descripcion', 'segmentos'])
  if (pu) {
    publico.descripcion = c.texto(pu.descripcion, 'publico.descripcion', 1, MAX_TEXTO)
    sinContacto(publico.descripcion, 'publico.descripcion')
    c.lista(pu.segmentos, 'publico.segmentos', 0, 6).forEach((s, i) => {
      const ruta = `publico.segmentos[${i}]`
      const o = c.objeto(s, ruta, ['nombre', 'criterio', 'porque'])
      if (!o) return
      const seg = {
        nombre: c.texto(o.nombre, `${ruta}.nombre`, 1, MAX_CORTO),
        criterio: c.texto(o.criterio, `${ruta}.criterio`, 1, MAX_TEXTO),
        porque: c.texto(o.porque, `${ruta}.porque`, 1, MAX_TEXTO),
      }
      for (const [k, v] of Object.entries(seg)) sinContacto(v, `${ruta}.${k}`)
      publico.segmentos.push(seg)
    })
  }

  const marcas = c.lista(r.marcas, 'marcas', 1, brief.marcas.length).map((m) => {
    if (typeof m !== 'string' || !brief.marcas.includes(m)) c.err(`Las marcas del plan deben ser las del brief: "${String(m)}" no está.`)
    return String(m)
  })

  const presupuesto: Plan['presupuesto'] = { montoArs: null, nivel: 'a_definir', nota: null }
  const pr = c.objeto(r.presupuesto, 'presupuesto', ['montoArs', 'nivel', 'nota'])
  if (pr) {
    const nivel = pr.nivel
    if (!(NIVELES_PRESUPUESTO as readonly unknown[]).includes(nivel)) c.err('El nivel del presupuesto debe ser campania, conjunto o a_definir.')
    else presupuesto.nivel = nivel as Plan['presupuesto']['nivel']
    const m = pr.montoArs
    if (m !== null) {
      if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) c.err('El monto del presupuesto debe ser un número de ARS mayor o igual a 0.')
      else if (presupuesto.nivel === 'a_definir') c.err('Con nivel a_definir el monto debe ser null.')
      else if (brief.presupuestoTopeArs !== null && m > brief.presupuestoTopeArs) c.err('El monto supera el tope de presupuesto del brief.')
      else presupuesto.montoArs = m
    }
    presupuesto.nota = c.textoONull(pr.nota, 'presupuesto.nota')
  }

  const ventana = { desde: '', hasta: '' }
  const ve = c.objeto(r.ventana, 'ventana', ['desde', 'hasta'])
  if (ve) {
    const d = fechaIso(ve.desde)
    const h = fechaIso(ve.hasta)
    const bd = fechaIso(brief.desde)!
    const bh = fechaIso(brief.hasta)!
    if (d === null || h === null) c.err('La ventana debe tener fechas válidas (AAAA-MM-DD).')
    else if (d > h) c.err('La ventana no puede empezar después de terminar.')
    else if (d < bd || h > bh) c.err('La ventana debe estar dentro de las fechas del brief.')
    else {
      ventana.desde = ve.desde as string
      ventana.hasta = ve.hasta as string
    }
  }

  const canales: Plan['canales'] = []
  c.lista(r.canales, 'canales', 1, 4).forEach((x2, i) => {
    const ruta = `canales[${i}]`
    const o = c.objeto(x2, ruta, ['plataforma', 'formatos', 'porcentaje', 'porque'])
    if (!o) return
    const plataforma = o.plataforma
    if (!(PLATAFORMAS as readonly unknown[]).includes(plataforma)) c.err(`La plataforma de ${ruta} debe ser instagram o facebook.`)
    const formatos = c.lista(o.formatos, `${ruta}.formatos`, 1, 5).filter((f) => {
      const v = (FORMATOS as readonly unknown[]).includes(f)
      if (!v) c.err(`Formato inválido en ${ruta}: "${String(f)}".`)
      return v
    })
    canales.push({
      plataforma: plataforma as Plan['canales'][number]['plataforma'],
      formatos: formatos as Plan['canales'][number]['formatos'],
      porcentaje: c.entero(o.porcentaje, `${ruta}.porcentaje`, 0, 100),
      porque: c.texto(o.porque, `${ruta}.porque`, 1, MAX_TEXTO),
    })
  })
  if (new Set(canales.map((k) => k.plataforma)).size !== canales.length) c.err('Los canales no pueden repetir plataforma.')
  if (canales.length > 0 && canales.reduce((s, k) => s + k.porcentaje, 0) !== 100) c.err('Los porcentajes de los canales deben sumar 100.')

  const calendario: Plan['calendario'] = []
  const inicio = fechaIso(brief.desde)!
  const fin = fechaIso(brief.hasta)!
  c.lista(r.calendario, 'calendario', 1, 13).forEach((s, i) => {
    const ruta = `calendario[${i}]`
    const o = c.objeto(s, ruta, ['semana', 'eje', 'piezas'])
    if (!o) return
    const semana = c.entero(o.semana, `${ruta}.semana`, 1, 13)
    if (semana !== i + 1) c.err(`Las semanas del calendario deben ser consecutivas desde 1 (${ruta}.semana).`)
    else if (inicio + (semana - 1) * 7 * DIA_MS > fin) c.err(`La semana ${semana} queda fuera de las fechas del brief.`)
    const piezas: Plan['calendario'][number]['piezas'] = []
    c.lista(o.piezas, `${ruta}.piezas`, 1, 20).forEach((p, j) => {
      const rp = `${ruta}.piezas[${j}]`
      const po = c.objeto(p, rp, ['plataforma', 'formato', 'cantidad', 'idea'])
      if (!po) return
      const pl = po.plataforma
      if (!canales.some((k) => k.plataforma === pl)) c.err(`La plataforma de ${rp} no está entre los canales del plan.`)
      if (!(FORMATOS as readonly unknown[]).includes(po.formato)) c.err(`Formato inválido en ${rp}.`)
      piezas.push({
        plataforma: pl as Plan['canales'][number]['plataforma'],
        formato: po.formato as Plan['calendario'][number]['piezas'][number]['formato'],
        cantidad: c.entero(po.cantidad, `${rp}.cantidad`, 1, 20),
        idea: c.texto(po.idea, `${rp}.idea`, 1, MAX_IDEA),
      })
    })
    calendario.push({ semana, eje: c.texto(o.eje, `${ruta}.eje`, 1, MAX_CORTO), piezas })
  })

  const kpis = c.lista(r.kpis, 'kpis', 0, 6).flatMap((k, i) => {
    const o = c.objeto(k, `kpis[${i}]`, ['metrica', 'meta'])
    return o ? [{ metrica: c.texto(o.metrica, `kpis[${i}].metrica`, 1, MAX_CORTO), meta: c.texto(o.meta, `kpis[${i}].meta`, 1, MAX_CORTO) }] : []
  })
  const fundamentos = c.lista(r.fundamentos, 'fundamentos', 1, 12).map((t, i) => c.texto(t, `fundamentos[${i}]`, 1, MAX_TEXTO))
  const supuestos = c.lista(r.supuestos, 'supuestos', 0, 12).map((t, i) => c.texto(t, `supuestos[${i}]`, 1, MAX_TEXTO))

  if (c.errores.length > 0) return { ok: false, errores: c.errores }
  return {
    ok: true,
    plan: { objetivo, mensajeCentral, publico, marcas, presupuesto, ventana, canales, calendario, kpis, fundamentos, supuestos },
  }
}
