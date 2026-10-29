'use client'

import { useState } from 'react'
import type { FotoVista, PiezaImagenVista } from '@/lib/productor/pantalla'
import { Galeria } from './galeria'

type Filtro = 'todas' | 'foto' | 'texto'
const FILTROS: readonly { id: Filtro; nombre: string }[] = [
  { id: 'todas', nombre: 'Todas' },
  { id: 'foto', nombre: 'Desde foto' },
  { id: 'texto', nombre: 'Desde texto' },
]

/**
 * "Imágenes generadas": UNA sola galería para lo que salió de una foto real y
 * de un texto aprobado, la más nueva primero. Cada generación lleva su insignia
 * de origen. Elegir para la pieza solo existe en las de texto: una foto no es
 * una pieza (la "elegida" sirve para publicar una pieza).
 */
export function GaleriaImagenes({
  piezas,
  fotos,
  puedeEditar,
  cambio,
}: {
  piezas: readonly PiezaImagenVista[]
  fotos: readonly FotoVista[]
  puedeEditar: boolean
  cambio?: { apagado: string | null; topeUsd: number | null; gastadoUsd: number }
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas')

  // Una "tarjeta" por generación: así se ordenan juntas las de foto y las de texto.
  const tarjetas = [
    ...piezas.flatMap((p) =>
      p.generaciones.map((g) => ({
        origen: 'texto' as const,
        g,
        pieza: { altText: p.pieza.altText },
        creativos: p.creativos.filter((c) => c.generacionId === g.id),
      })),
    ),
    ...fotos.flatMap((f) =>
      f.generaciones.map((g) => ({
        origen: 'foto' as const,
        g,
        pieza: { altText: 'Foto de la moto editada' },
        creativos: f.creativos.filter((c) => c.generacionId === g.id),
      })),
    ),
  ].sort((a, b) => b.g.creadoEn.localeCompare(a.g.creadoEn))

  const visibles = tarjetas.filter((t) => filtro === 'todas' || t.origen === filtro)

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filtrar por origen" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-3 py-1 text-sm hover:opacity-70 ${filtro === f.id ? 'border-(--color-ok) font-semibold' : 'border-(--color-borde)'}`}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      {tarjetas.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">
          Todavía no se generó ninguna imagen. Cuando generes una, va a aparecer acá, con su costo real.
        </p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">
          Todavía no hay imágenes {filtro === 'foto' ? 'desde foto' : 'desde texto'}.
        </p>
      ) : (
        <div className="space-y-6">
          {visibles.map((t) => (
            <Galeria
              key={t.g.id}
              pieza={{ pieza: t.pieza, generaciones: [t.g], creativos: t.creativos }}
              puedeEditar={puedeEditar}
              cambio={cambio}
              elegible={t.origen === 'texto'}
              insignia={t.origen === 'foto' ? 'Desde foto' : 'Desde texto'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
