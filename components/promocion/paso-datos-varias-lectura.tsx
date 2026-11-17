import Link from 'next/link'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import type { PromocionVista } from '@/lib/promocion/tipos'
import { boton, botonPrincipal, TituloPaso } from './ui'

/**
 * Paso 1 de una placa de VARIAS MOTOS que ya existe (ADR-041): las motos y sus precios, de solo lectura. Se fijan al crear porque cada foto, cada
 * modelo y cada precio quedan emparejados en la imagen: para otras motos se arma otra placa. Solo mira, así que el lector la ve igual que quien edita.
 */
export function MotosDeLaPlaca({ promocion, marca, motos }: { promocion: PromocionVista; marca: string; motos: NonNullable<DetallePromocion['motos']> }) {
  return (
    <section>
      <TituloPaso numero={1} pregunta="¿Qué motos van en la placa?" leyenda={`${marca}: ${motos.length} motos juntas en una sola imagen.`} />
      <ul aria-label="Motos de la placa" className="grid gap-3 sm:grid-cols-2">
        {motos.map((m, i) => (
          <li key={m.fotoId} className="space-y-2 rounded-lg border border-(--color-borde) p-3">
            {m.url && !m.borrada ? (
              <img src={m.url} alt={`Moto ${i + 1}: ${m.modelo}`} className="aspect-4/3 w-full rounded-md object-cover" />
            ) : (
              <p className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">La foto de esta moto se borró. Armá otra placa con otra foto.</p>
            )}
            <p className="text-xs text-(--color-tenue)">Moto {i + 1}</p>
            <p className="font-semibold">{m.modelo}</p>
            <p className="tabular-nums">{m.precio}</p>
            {m.condicion !== '' && <p className="text-sm text-(--color-tenue)">{m.condicion}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-(--color-tenue)">Las motos, sus fotos y sus precios no se cambian después de crear la placa: para otras motos armá otra placa. Lugar: {promocion.datos.lugar}.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/promocionar/${promocion.id}?paso=${promocion.pasoActual}`} className={botonPrincipal}>
          Seguir
        </Link>
        <Link href="/promocionar/nueva?que=varias" className={boton}>
          Armar otra placa con otras motos
        </Link>
      </div>
    </section>
  )
}
