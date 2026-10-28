import Link from 'next/link'
import { costoLoteImagenes, formatearCostoAproximado } from '@/lib/promocion/costos'
import { OPCIONES_QUE, type Que } from '@/lib/promocion/lote/que'
import { MOTOR_IMAGEN_POR_DEFECTO } from '@/lib/productor/precios'
import { TituloPaso } from './ui'

/** Cuánto sale la imagen de cada opción, aproximado (el precio exacto se ve antes de confirmar). */
function costoDe(id: Que): string {
  const una = formatearCostoAproximado(costoLoteImagenes(MOTOR_IMAGEN_POR_DEFECTO, 1, 1).topeTotalUsd)
  if (id === 'una') return `Imagen: ${una}.`
  if (id === 'motos') return `Imagen: ${una} por moto.`
  return `Una sola imagen para todos los textos: ${formatearCostoAproximado(costoLoteImagenes(MOTOR_IMAGEN_POR_DEFECTO, 1, 2).topeTotalUsd)}.`
}

/** Paso 0 · ¿Qué querés armar? Cada opción es un link a su formulario. Elegir no cuesta nada. */
export function QueArmar() {
  return (
    <section>
      <TituloPaso numero={0} pregunta="¿Qué querés armar?" leyenda="Elegí cuántas motos y cuántos textos; el resto lo pedimos en el formulario." />
      <ul className="grid gap-3">
        {OPCIONES_QUE.map((o) => (
          <li key={o.id}>
            <Link
              href={`/promocionar/nueva?que=${o.id}`}
              className="block rounded-lg border border-(--color-borde) px-4 py-3 hover:opacity-70 focus-visible:outline-2"
            >
              <span className="block font-semibold">{o.titulo}</span>
              <span className="block text-sm text-(--color-tenue)">{o.leyenda}</span>
              <span className="block text-xs text-(--color-tenue)">{costoDe(o.id)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-(--color-tenue)">Elegir no cuesta nada: el precio de las imágenes se ve y se confirma más adelante.</p>
    </section>
  )
}
