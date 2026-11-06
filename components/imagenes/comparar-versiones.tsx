'use client'

import { Lightbox } from '@/components/ui/lightbox'

export type ImagenAComparar = { id: string; url: string; alt: string; rotulo: string }

/** Dos imágenes una al lado de la otra (apiladas en el celu), para decidir cuál queda. Gratis: solo mira. */
export function CompararVersiones({ imagenes, alCerrar }: { imagenes: readonly [ImagenAComparar, ImagenAComparar] | null; alCerrar: () => void }) {
  return (
    <Lightbox abierto={imagenes !== null} alCerrar={alCerrar} titulo="Comparar versiones">
      {imagenes && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {imagenes.map((i) => (
            <figure key={i.id} className="min-w-0 space-y-1">
              <img src={i.url} alt={i.alt} className="mx-auto max-h-[75dvh] w-auto max-w-full touch-pinch-zoom object-contain" />
              <figcaption className="text-center text-xs text-(--color-tenue)">{i.rotulo}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Lightbox>
  )
}
