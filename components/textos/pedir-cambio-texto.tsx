'use client'

import { useId, useRef, useState } from 'react'
import type { ResultadoCambio } from './api'
import { MAX_PEDIDO, MIN_PEDIDO } from '@/lib/agentes/conversacion/limites'
import type { VersionTexto } from '@/lib/promocion/textos/versiones'

const boton = 'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
const botonPrincipal = 'rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold hover:opacity-70 disabled:cursor-not-allowed disabled:border-(--color-borde) disabled:opacity-50'
const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1.5 text-sm disabled:opacity-60'

/**
 * "Pedile un cambio a la IA" sobre un texto (promoción o pieza). Cuesta centavos: el botón dice cuánto y
 * el tope por ítem y por día lo pone el servidor ANTES de llamar al modelo (429 con su mensaje). Un solo
 * pedido a la vez (el doble click no manda dos). Si hay versiones (promoción), "Usar esta" vuelve a una
 * anterior sin costo.
 */
export function PedirCambioTexto({
  costo,
  habilitado,
  puedeEditar,
  pedir,
  alTerminar,
  versiones = [],
  alUsar,
}: {
  /** "~US$ 0,001" (vacío si el modelo no tiene precio). */
  costo: string
  /** Hay clave de OpenAI. */
  habilitado: boolean
  puedeEditar: boolean
  pedir: (instruccion: string) => Promise<ResultadoCambio>
  /** El cambio ya está aplicado: refrescar. */
  alTerminar: () => void
  versiones?: readonly VersionTexto[]
  /** "Usar esta": poner esa versión como el texto de la promoción (gratis, sin IA). */
  alUsar?: (version: VersionTexto) => Promise<ResultadoCambio>
}) {
  const id = useId()
  const [instruccion, setInstruccion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)
  if (!puedeEditar) return null

  async function correr(accion: () => Promise<ResultadoCambio>, alOk?: () => void) {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    setError(null)
    const r = await accion()
    enCurso.current = false
    setOcupado(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    alOk?.()
    alTerminar()
  }

  return (
    <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
      <label htmlFor={id} className="text-sm font-medium">
        Pedile un cambio a la IA
      </label>
      {!habilitado && (
        <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
          Pedir cambios está apagado en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema.
        </p>
      )}
      <textarea
        id={id}
        className={campo}
        rows={2}
        maxLength={MAX_PEDIDO}
        value={instruccion}
        disabled={ocupado}
        placeholder="Ej.: más corto y con tono directo"
        onChange={(e) => setInstruccion(e.target.value)}
      />
      <p className="text-xs text-(--color-tenue) tabular-nums">
        {instruccion.length}/{MAX_PEDIDO} · La IA cambia solo eso y deja lo demás igual.
      </p>
      <button
        type="button"
        className={botonPrincipal}
        disabled={!habilitado || ocupado || instruccion.trim().length < MIN_PEDIDO}
        onClick={() => void correr(() => pedir(instruccion.trim()), () => setInstruccion(''))}
      >
        Pedir cambio{costo ? ` · ${costo}` : ''}
      </button>
      {ocupado && (
        <p role="status" className="text-sm text-(--color-tenue)">
          Trabajando… puede tardar hasta un minuto.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {versiones.length > 1 && alUsar && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Versiones</p>
          <ul aria-label="Versiones del texto" className="space-y-1.5">
            {versiones.map((v) => (
              <li key={v.clave} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{v.etiqueta}</span>
                  {v.pedido && <span className="text-(--color-tenue)"> · «{v.pedido}»</span>}
                  {v.actual && <span className="ml-2 text-xs text-(--color-ok)">Texto actual</span>}
                  <span className="block text-xs text-(--color-tenue)">{v.copy.titular}</span>
                </span>
                {!v.actual && (
                  <button type="button" className={boton} disabled={ocupado} onClick={() => void correr(() => alUsar(v))}>
                    Usar esta
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
