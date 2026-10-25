'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type OpcionSeleccion = { readonly valor: string; readonly rotulo: string }

type Props = {
  /** Título del grupo (se ve): "Marcas". El contador "3 de 7" se agrega solo. */
  legend: string
  opciones: readonly OpcionSeleccion[]
  /** Los valores marcados. */
  valor: readonly string[]
  /** Modo controlado (formularios): se llama con la lista nueva, en el orden de `opciones`. Sin `name`. */
  onCambio?: (valor: string[]) => void
  /** Modo URL (form GET): cada marcada viaja como `name=valor`, repetido. */
  name?: string
  /** Mostrar el chip "Todas" (tri-estado). */
  todas?: boolean
  /** Modo URL: enviar el formulario en cada cambio. Sin JS queda el botón "Aplicar" del formulario. */
  autoEnviar?: boolean
  /** Mínimo de opciones marcadas: la última no se puede desmarcar. */
  minimo?: number
}

const chip =
  'flex min-h-11 cursor-pointer items-center rounded-full border border-(--color-borde) px-3.5 py-1.5 text-sm text-(--color-tenue) select-none ' +
  'has-[:checked]:border-current has-[:checked]:font-medium has-[:checked]:text-inherit ' +
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 hover:opacity-70'

/**
 * Elegir varias opciones (marcas, plataformas) con chips que son checkboxes nativos:
 * estado, teclado y lector de pantalla gratis, y en modo URL funciona sin JS (ADR-028).
 * "Todas" es tri-estado; nunca queda vacío (la última marcada no se desmarca).
 *
 * `onCambio` = modo controlado (para formularios con estado); `name` = modo URL
 * (dentro de un <Form> GET de next/form), con `autoEnviar` para aplicar al tocar.
 */
export function SeleccionMultiple({ legend, opciones, valor, onCambio, name, todas = true, autoEnviar = false, minimo = 1 }: Props) {
  const idAyuda = useId()
  const refTodas = useRef<HTMLInputElement>(null)
  const refGrupo = useRef<HTMLFieldSetElement>(null)
  const quiereEnviar = useRef(false)

  // Modo URL: el estado vive acá, arrancando del valor que dejó la URL (y siguiéndola si cambia).
  const [interno, setInterno] = useState<readonly string[]>(valor)
  const clave = valor.join('\u0000')
  const [claveVista, setClaveVista] = useState(clave)
  if (clave !== claveVista) {
    setClaveVista(clave)
    setInterno(valor)
  }
  const actual = onCambio ? valor : interno
  const marcadas = opciones.filter((o) => actual.includes(o.valor))

  const todasMarcadas = marcadas.length === opciones.length
  const algunas = marcadas.length > 0 && !todasMarcadas
  const enElMinimo = marcadas.length <= minimo

  useEffect(() => {
    if (refTodas.current) refTodas.current.indeterminate = algunas
  }, [algunas])

  // El envío espera a que React termine de pintar las casillas: requestSubmit lee el DOM.
  useEffect(() => {
    if (!quiereEnviar.current) return
    quiereEnviar.current = false
    refGrupo.current?.form?.requestSubmit()
  }, [interno])

  function aplicar(proximas: string[]) {
    const ordenadas = opciones.filter((o) => proximas.includes(o.valor)).map((o) => o.valor)
    if (onCambio) {
      onCambio(ordenadas)
      return
    }
    quiereEnviar.current = autoEnviar
    setInterno(ordenadas)
  }

  function alternar(v: string, marcar: boolean) {
    if (!marcar && enElMinimo) return
    aplicar(marcar ? [...marcadas.map((o) => o.valor), v] : marcadas.filter((o) => o.valor !== v).map((o) => o.valor))
  }

  function alternarTodas() {
    // Con todas marcadas vuelve al valor por defecto (la primera): nunca queda vacío.
    aplicar(todasMarcadas ? [opciones[0]!.valor] : opciones.map((o) => o.valor))
  }

  return (
    <fieldset ref={refGrupo} className="min-w-0">
      <legend className="text-sm">
        {legend} <span className="text-(--color-tenue)">({marcadas.length} de {opciones.length})</span>
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {todas && (
          <label className={chip}>
            <input
              ref={refTodas}
              type="checkbox"
              className="sr-only"
              checked={todasMarcadas}
              aria-checked={algunas ? 'mixed' : todasMarcadas}
              onChange={alternarTodas}
            />
            Todas
          </label>
        )}
        {opciones.map((o) => {
          const marcada = actual.includes(o.valor)
          const bloqueada = marcada && enElMinimo
          return (
            <label key={o.valor} className={chip}>
              <input
                type="checkbox"
                className="sr-only"
                name={onCambio ? undefined : name}
                value={o.valor}
                checked={marcada}
                aria-disabled={bloqueada ? true : undefined}
                aria-describedby={bloqueada ? idAyuda : undefined}
                onChange={(e) => alternar(o.valor, e.target.checked)}
              />
              {o.rotulo}
            </label>
          )
        })}
      </div>
      {enElMinimo && (
        <p id={idAyuda} className="sr-only">
          Tiene que quedar al menos una
        </p>
      )}
    </fieldset>
  )
}
