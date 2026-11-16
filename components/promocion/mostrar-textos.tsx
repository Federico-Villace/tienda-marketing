'use client'

import { OCULTABLES, type Ocultable } from '@/lib/promocion/diseno/tipos'
import { tarjetaOpcion } from './ui'

/** Cada casilla es un elemento que se ve en la placa; los dos logos son UNA sola casilla. */
type Casilla = { id: string; nombre: string; ocultables: readonly Ocultable[] }

const DE_DISENO: readonly Casilla[] = [
  { id: 'modelo', nombre: 'Modelo', ocultables: ['modelo'] },
  { id: 'frase', nombre: 'Frase', ocultables: ['frase'] },
  { id: 'precio', nombre: 'Precio', ocultables: ['precio'] },
  { id: 'condicion', nombre: 'Cuotas', ocultables: ['condicion'] },
  { id: 'cta', nombre: 'Consultanos', ocultables: ['cta'] },
  { id: 'lugar', nombre: 'Lugar', ocultables: ['lugar'] },
  { id: 'logos', nombre: 'Logos', ocultables: ['logo999', 'logoConcesionaria'] },
]
/** En las clásicas no hay botón; la frase es el titular y los logos son la línea de la marca. */
const DE_CLASICA: readonly Casilla[] = DE_DISENO.filter((c) => c.id !== 'cta')

/**
 * "Mostrar": una casilla por cada texto o logo de la placa. Destildar uno lo SACA (no se dibuja): se puede dejar una imagen sin texto.
 * Es gratis: cambia lo que dibuja la placa, no la imagen que generó la IA. Guarda al instante por el camino de siempre.
 */
export function MostrarTextos({ clasica = false, ocultos, onCambiar, deshabilitado }: { clasica?: boolean; ocultos: readonly Ocultable[]; onCambiar: (ocultos: Ocultable[]) => void; deshabilitado: boolean }) {
  const casillas = clasica ? DE_CLASICA : DE_DISENO
  const visible = (c: Casilla) => c.ocultables.every((o) => !ocultos.includes(o))
  const alternar = (c: Casilla) => {
    const sacar = visible(c)
    const sigue = ocultos.filter((o) => !c.ocultables.includes(o))
    onCambiar(OCULTABLES.filter((o) => (sacar ? [...sigue, ...c.ocultables] : sigue).includes(o)))
  }
  return (
    <fieldset className="min-w-0 space-y-2" disabled={deshabilitado} data-testid="mostrar-textos">
      <legend className="text-sm font-medium">Mostrar</legend>
      <div className="flex flex-wrap gap-2">
        {casillas.map((c) => (
          <label key={c.id} className={`${tarjetaOpcion} items-center`}>
            <input type="checkbox" checked={visible(c)} onChange={() => alternar(c)} />
            <span>{c.nombre}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-(--color-tenue)">Destildá lo que no quieras ver en la placa: no se dibuja. Gratis, se ve al instante.</p>
    </fieldset>
  )
}
