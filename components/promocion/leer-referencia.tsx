'use client'

import { useRef, useState } from 'react'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { PLANTILLAS_DISENO } from '@/lib/promocion/diseno/catalogo'
import { textoDeAviso, textoDeMotivo, type LecturaVista } from '@/lib/promocion/referencia/lectura'
import { boton, botonPrincipal, Estado } from './ui'

export type ResultadoLeer = { ok: true; lectura: LecturaVista; costoUsd: number; desdeCache: boolean } | { ok: false; status: number; error: string; errores?: string[] }

/**
 * "Leer el diseño" de la tarjeta "Como tu referencia" (ADR-039). Es plata (centavos), así que tiene SU compuerta, igual de estricta que la de la imagen:
 * el botón muestra el precio y NO gasta; recién "Confirmar US$ X" manda el pedido, con el precio que se vio. Si esa foto ya se leyó
 * es gratis y un click alcanza. El lector no ve nada. La persona no elige posiciones: la lectura las saca de su foto.
 */
export function LeerReferencia({
  costoUsd,
  gratis,
  puedeEditar,
  apagado,
  deshabilitado,
  yaLeida = false,
  leer,
}: {
  /** Lo más que puede costar leerla (lo calcula el servidor), o null si no se puede calcular (modelo sin precio). */
  costoUsd: number | null
  /** Esta misma foto ya se leyó: leerla otra vez no cuesta. */
  gratis: boolean
  puedeEditar: boolean
  /** Por qué no se puede pedir (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  deshabilitado: boolean
  /** Esta foto ya está leída y puesta: no se ofrece leerla otra vez (el resumen de lo que acaba de pasar sí se queda). */
  yaLeida?: boolean
  /** Hace el pedido con el precio aceptado (el padre lo pone en fila con el resto de los guardados). */
  leer: (aceptadoUsd: number) => Promise<ResultadoLeer>
}) {
  const [fase, setFase] = useState<'inicio' | 'confirmar'>('inicio')
  const [leyendo, setLeyendo] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [resultado, setResultado] = useState<{ lectura: LecturaVista; costoUsd: number; desdeCache: boolean } | null>(null)
  // Un doble click no manda dos pedidos: la marca se pone ANTES de que React vuelva a dibujar.
  const enVuelo = useRef(false)

  if (!puedeEditar) return null

  const sinPrecio = !gratis && costoUsd === null
  const bloqueado = deshabilitado || leyendo || apagado !== null || sinPrecio
  const precio = costoUsd === null ? '' : formatearUsdCorto(costoUsd)

  async function pedir(aceptadoUsd: number) {
    if (enVuelo.current) return
    enVuelo.current = true
    setLeyendo(true)
    setErrores([])
    setResultado(null)
    try {
      const r = await leer(aceptadoUsd)
      if (r.ok) {
        setResultado({ lectura: r.lectura, costoUsd: r.costoUsd, desdeCache: r.desdeCache })
        setFase('inicio')
      } else {
        setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
        setFase('inicio')
      }
    } finally {
      enVuelo.current = false
      setLeyendo(false)
    }
  }

  const ofrecer = !yaLeida && resultado === null

  return (
    <div className="space-y-3" data-testid="leer-referencia">
      {ofrecer && apagado && <p className="text-xs text-(--color-aviso)">{apagado}</p>}

      {ofrecer &&
        (fase === 'inicio' ? (
          <button type="button" className={`${botonPrincipal} w-full sm:w-auto`} disabled={bloqueado} onClick={() => (gratis ? void pedir(0) : setFase('confirmar'))}>
            Leer el diseño · {gratis ? 'gratis' : precio}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              Leer tu referencia cuesta hasta <strong>{precio}</strong> (se cobra lo que use, que suele ser menos). Nada se cobra hasta que confirmes.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={botonPrincipal} disabled={bloqueado} onClick={() => void pedir(costoUsd ?? 0)}>
                {leyendo ? 'Leyendo…' : `Confirmar ${precio}`}
              </button>
              <button type="button" className={boton} disabled={leyendo} onClick={() => setFase('inicio')}>
                Cancelar
              </button>
            </div>
          </div>
        ))}

      {leyendo && <p role="status" className="text-sm text-(--color-tenue)">Leyendo tu referencia… puede tardar hasta un minuto.</p>}

      {errores.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {errores.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {resultado && <ResumenDeLectura {...resultado} />}
    </div>
  )
}

function ResumenDeLectura({ lectura, costoUsd, desdeCache }: { lectura: LecturaVista; costoUsd: number; desdeCache: boolean }) {
  const cobro = desdeCache || costoUsd === 0 ? 'No se cobró nada: ya estaba leída.' : `Costó ${formatearUsdCorto(costoUsd)}.`
  if (lectura.estado === 'lista') {
    return (
      <Estado>
        <span className="block">Listo: leímos tu referencia y armamos el diseño con tu texto. {cobro}</span>
        <span className="block">Mirá cómo queda abajo (es gratis) antes de generar la imagen.</span>
        {lectura.avisos.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {lectura.avisos.map((a, i) => (
              <li key={`${a.zona}-${a.codigo}-${i}`}>{textoDeAviso(a)}</li>
            ))}
          </ul>
        )}
      </Estado>
    )
  }
  const usada = lectura.fallback ? PLANTILLAS_DISENO[lectura.fallback].nombre : null
  return (
    <Estado>
      <span className="block">{textoDeMotivo(lectura.motivo)} No pudimos copiar su diseño.</span>
      <span className="block">{usada ? `Dejamos la plantilla ${usada}, que es del mismo tono.` : 'Elegí una de las plantillas.'} {cobro}</span>
    </Estado>
  )
}
