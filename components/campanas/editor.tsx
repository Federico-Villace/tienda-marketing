'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FORMATOS, NIVELES_PRESUPUESTO, PLATAFORMAS, type Plan, type PlanVista } from '@/lib/estratega/tipos'
import { patchPlan } from './api'

const campo =
  'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
const chico = 'rounded-md border border-(--color-borde) px-2 py-1 text-xs hover:opacity-70'
const titulo = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const lineas = (t: string) => t.split('\n')

const NIVEL_ROTULO = { campania: 'Campaña', conjunto: 'Conjunto de anuncios', a_definir: 'A definir' } as const

/**
 * Edición inline del plan en estado local. Guardar crea una versión nueva (US$ 0):
 * la validación real la hace el endpoint con validarPlan y sus errores se
 * muestran acá.
 */
export function Editor({ vista, onCerrar }: { vista: PlanVista; onCerrar: () => void }) {
  const router = useRouter()
  const [plan, setPlan] = useState<Plan>(() => structuredClone(vista.plan))
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const enCurso = useRef(false)

  const cambiar = (fn: (p: Plan) => void) =>
    setPlan((previo) => {
      const copia = structuredClone(previo)
      fn(copia)
      return copia
    })

  const suma = plan.canales.reduce((s, c) => s + (Number.isFinite(c.porcentaje) ? c.porcentaje : 0), 0)

  async function guardar() {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    setErrores([])
    const limpio: Plan = {
      ...plan,
      presupuesto: {
        ...plan.presupuesto,
        montoArs: plan.presupuesto.nivel === 'a_definir' ? null : plan.presupuesto.montoArs,
        nota: plan.presupuesto.nota?.trim() ? plan.presupuesto.nota : null,
      },
      fundamentos: plan.fundamentos.filter((t) => t.trim()),
      supuestos: plan.supuestos.filter((t) => t.trim()),
    }
    const r = await patchPlan(vista.id, { plan: limpio, version: vista.version })
    enCurso.current = false
    setCargando(false)
    if (r.ok) {
      router.push(`/campanas?plan=${vista.raizId}`)
      router.refresh()
      onCerrar()
      return
    }
    setError(r.error)
    setErrores(r.errores)
    if (r.status === 409) router.refresh()
  }

  return (
    <form
      className="space-y-6 rounded-lg border border-(--color-borde) px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <p className="text-sm text-(--color-tenue)">
        Editar crea la versión {vista.version + 1}, sin costo. La anterior queda en el historial.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Objetivo
          <input aria-label="Objetivo" className={campo} value={plan.objetivo} onChange={(e) => cambiar((p) => void (p.objetivo = e.target.value))} />
        </label>
        <label className="block text-sm">
          Mensaje central
          <input aria-label="Mensaje central" className={campo} value={plan.mensajeCentral} onChange={(e) => cambiar((p) => void (p.mensajeCentral = e.target.value))} />
        </label>
      </div>

      <section>
        <h3 className={titulo}>Público (solo texto)</h3>
        <textarea
          aria-label="Descripción del público"
          className={campo}
          rows={2}
          value={plan.publico.descripcion}
          onChange={(e) => cambiar((p) => void (p.publico.descripcion = e.target.value))}
        />
        {plan.publico.segmentos.map((s, i) => (
          <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input aria-label={`Segmento ${i + 1} nombre`} className={campo} value={s.nombre} onChange={(e) => cambiar((p) => void (p.publico.segmentos[i]!.nombre = e.target.value))} />
            <input aria-label={`Segmento ${i + 1} criterio`} className={campo} value={s.criterio} onChange={(e) => cambiar((p) => void (p.publico.segmentos[i]!.criterio = e.target.value))} />
            <input aria-label={`Segmento ${i + 1} porque`} className={campo} value={s.porque} onChange={(e) => cambiar((p) => void (p.publico.segmentos[i]!.porque = e.target.value))} />
            <button type="button" className={chico} onClick={() => cambiar((p) => void p.publico.segmentos.splice(i, 1))}>
              Quitar segmento {i + 1}
            </button>
          </div>
        ))}
        <button type="button" className={`${chico} mt-2`} onClick={() => cambiar((p) => void p.publico.segmentos.push({ nombre: '', criterio: '', porque: '' }))}>
          Agregar segmento
        </button>
      </section>

      <section>
        <h3 className={titulo}>Presupuesto (propuesta)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            Monto (ARS)
            <input
              type="number"
              min={0}
              aria-label="Monto del presupuesto (ARS)"
              className={campo}
              value={plan.presupuesto.montoArs ?? ''}
              onChange={(e) => cambiar((p) => void (p.presupuesto.montoArs = e.target.value === '' ? null : Number(e.target.value)))}
            />
          </label>
          <label className="block text-sm">
            Nivel
            <select
              aria-label="Nivel del presupuesto"
              className={campo}
              value={plan.presupuesto.nivel}
              onChange={(e) =>
                cambiar((p) => {
                  p.presupuesto.nivel = e.target.value as Plan['presupuesto']['nivel']
                  if (p.presupuesto.nivel === 'a_definir') p.presupuesto.montoArs = null
                })
              }
            >
              {NIVELES_PRESUPUESTO.map((n) => (
                <option key={n} value={n}>
                  {NIVEL_ROTULO[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Nota
            <input aria-label="Nota del presupuesto" className={campo} value={plan.presupuesto.nota ?? ''} onChange={(e) => cambiar((p) => void (p.presupuesto.nota = e.target.value))} />
          </label>
        </div>
      </section>

      <section>
        <h3 className={titulo}>Reparto por canal</h3>
        {plan.canales.map((c, i) => (
          <div key={i} className="mb-3 space-y-2 rounded-md border border-(--color-borde) p-3">
            <div className="grid gap-2 sm:grid-cols-[auto_6rem_1fr_auto]">
              <select aria-label={`Canal ${i + 1} plataforma`} className={campo} value={c.plataforma} onChange={(e) => cambiar((p) => void (p.canales[i]!.plataforma = e.target.value as Plan['canales'][number]['plataforma']))}>
                {PLATAFORMAS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              <input type="number" min={0} max={100} aria-label={`Canal ${i + 1} porcentaje`} className={campo} value={c.porcentaje} onChange={(e) => cambiar((p) => void (p.canales[i]!.porcentaje = Number(e.target.value)))} />
              <input aria-label={`Canal ${i + 1} porque`} className={campo} value={c.porque} onChange={(e) => cambiar((p) => void (p.canales[i]!.porque = e.target.value))} />
              <button type="button" className={chico} onClick={() => cambiar((p) => void p.canales.splice(i, 1))}>
                Quitar canal {i + 1}
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {FORMATOS.map((fm) => (
                <label key={fm} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`Canal ${i + 1} formato ${fm}`}
                    checked={c.formatos.includes(fm)}
                    onChange={(e) =>
                      cambiar((p) => {
                        const lista = p.canales[i]!.formatos
                        p.canales[i]!.formatos = e.target.checked ? [...lista, fm] : lista.filter((x) => x !== fm)
                      })
                    }
                  />
                  {fm}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className={chico} onClick={() => cambiar((p) => void p.canales.push({ plataforma: 'instagram', formatos: ['imagen'], porcentaje: 0, porque: '' }))}>
          Agregar canal
        </button>
        <p className={`mt-2 text-xs ${suma === 100 ? 'text-(--color-tenue)' : ''}`}>
          {suma === 100 ? 'Los canales suman 100%' : `Los canales suman ${suma}%: tienen que dar 100%`}
        </p>
      </section>

      <section>
        <h3 className={titulo}>Calendario</h3>
        {plan.calendario.map((s, i) => (
          <div key={i} className="mb-3 space-y-2 rounded-md border border-(--color-borde) p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input aria-label={`Semana ${i + 1} eje`} className={campo} value={s.eje} onChange={(e) => cambiar((p) => void (p.calendario[i]!.eje = e.target.value))} />
              <button
                type="button"
                className={chico}
                onClick={() =>
                  cambiar((p) => {
                    p.calendario.splice(i, 1)
                    p.calendario.forEach((x, j) => void (x.semana = j + 1))
                  })
                }
              >
                Quitar semana {i + 1}
              </button>
            </div>
            {s.piezas.map((z, j) => (
              <div key={j} className="grid gap-2 sm:grid-cols-[auto_auto_5rem_1fr_auto]">
                <select aria-label={`Semana ${i + 1} pieza ${j + 1} plataforma`} className={campo} value={z.plataforma} onChange={(e) => cambiar((p) => void (p.calendario[i]!.piezas[j]!.plataforma = e.target.value as Plan['canales'][number]['plataforma']))}>
                  {PLATAFORMAS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <select aria-label={`Semana ${i + 1} pieza ${j + 1} formato`} className={campo} value={z.formato} onChange={(e) => cambiar((p) => void (p.calendario[i]!.piezas[j]!.formato = e.target.value as Plan['calendario'][number]['piezas'][number]['formato']))}>
                  {FORMATOS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <input type="number" min={1} max={20} aria-label={`Semana ${i + 1} pieza ${j + 1} cantidad`} className={campo} value={z.cantidad} onChange={(e) => cambiar((p) => void (p.calendario[i]!.piezas[j]!.cantidad = Number(e.target.value)))} />
                <input aria-label={`Semana ${i + 1} pieza ${j + 1} idea`} className={campo} value={z.idea} onChange={(e) => cambiar((p) => void (p.calendario[i]!.piezas[j]!.idea = e.target.value))} />
                <button type="button" className={chico} onClick={() => cambiar((p) => void p.calendario[i]!.piezas.splice(j, 1))}>
                  Quitar pieza {j + 1} de semana {i + 1}
                </button>
              </div>
            ))}
            <button type="button" className={chico} onClick={() => cambiar((p) => void p.calendario[i]!.piezas.push({ plataforma: 'instagram', formato: 'imagen', cantidad: 1, idea: '' }))}>
              Agregar pieza a semana {i + 1}
            </button>
          </div>
        ))}
        <button type="button" className={chico} onClick={() => cambiar((p) => void p.calendario.push({ semana: p.calendario.length + 1, eje: '', piezas: [] }))}>
          Agregar semana
        </button>
      </section>

      <section>
        <h3 className={titulo}>KPIs</h3>
        {plan.kpis.map((k, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input aria-label={`KPI ${i + 1} métrica`} className={campo} value={k.metrica} onChange={(e) => cambiar((p) => void (p.kpis[i]!.metrica = e.target.value))} />
            <input aria-label={`KPI ${i + 1} meta`} className={campo} value={k.meta} onChange={(e) => cambiar((p) => void (p.kpis[i]!.meta = e.target.value))} />
            <button type="button" className={chico} onClick={() => cambiar((p) => void p.kpis.splice(i, 1))}>
              Quitar KPI {i + 1}
            </button>
          </div>
        ))}
        <button type="button" className={chico} onClick={() => cambiar((p) => void p.kpis.push({ metrica: '', meta: '' }))}>
          Agregar KPI
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Fundamentos (uno por línea)
          <textarea aria-label="Fundamentos (uno por línea)" className={campo} rows={4} value={plan.fundamentos.join('\n')} onChange={(e) => cambiar((p) => void (p.fundamentos = lineas(e.target.value)))} />
        </label>
        <label className="block text-sm">
          Supuestos (uno por línea)
          <textarea aria-label="Supuestos (uno por línea)" className={campo} rows={4} value={plan.supuestos.join('\n')} onChange={(e) => cambiar((p) => void (p.supuestos = lineas(e.target.value)))} />
        </label>
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          <p>{error}</p>
          {errores.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={boton} disabled={cargando}>
          Guardar como versión {vista.version + 1}
        </button>
        <button type="button" className={boton} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
