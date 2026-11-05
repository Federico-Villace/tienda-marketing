'use client'

/**
 * El selector de la foto de la moto, el mismo en Promociones y en Imágenes: una grilla de miniaturas con su
 * "nombre" (el modelo de la última promoción que la usó, o "Foto sin moto asignada") y la fecha en chico.
 * Solo muestra y avisa qué foto se eligió: no sube ni borra nada.
 */

export type FotoElegible = { id: string; creadoEn: string; url: string | null; modelo?: string | null }

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })

export const SIN_MOTO = 'Foto sin moto asignada'

export function ElegirFoto({
  fotos,
  valor,
  onElegir,
  grilla = 'grid-cols-2 gap-2 sm:grid-cols-3',
  nombre = 'foto',
}: {
  fotos: readonly FotoElegible[]
  valor: string | null
  onElegir: (id: string) => void
  grilla?: string
  nombre?: string
}) {
  return (
    <div className="space-y-2">
      <ul className={`grid ${grilla}`}>
        {fotos.map((x) => (
          <li key={x.id}>
            <label className="flex h-full cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border border-(--color-borde) p-2 text-sm has-[:checked]:border-2 has-[:checked]:border-(--color-ok) has-[:focus-visible]:outline-2">
              <span className="flex items-start gap-2">
                <input type="radio" name={nombre} value={x.id} checked={valor === x.id} onChange={() => onElegir(x.id)} className="mt-1" />
                <span className="min-w-0">
                  <span className="block font-medium">{x.modelo ?? SIN_MOTO}</span>
                  <span className="block text-xs text-(--color-tenue)">subida el {fecha(x.creadoEn)}</span>
                </span>
              </span>
              {x.url ? <img src={x.url} alt="Miniatura de la foto" loading="lazy" className="aspect-square w-full rounded-md object-cover" /> : <span className="py-4 text-center text-xs text-(--color-tenue)">Sin vista previa</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-(--color-tenue)">Son las mismas fotos en Promociones y en Imágenes.</p>
    </div>
  )
}
