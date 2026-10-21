import Link from 'next/link'
import { formatearUsd } from '@/lib/estratega/formato'
import type { TandaVista } from '@/lib/contenidista/tipos'

/** Tandas anteriores de una semana. Todo por links (GET): ver una no cuesta nada. */
export function HistorialTandas({ planId, tandas }: { planId: string; tandas: readonly TandaVista[] }) {
  if (tandas.length === 0) return null
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Tandas anteriores</h4>
      <ul className="space-y-2">
        {tandas.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
            <Link href={`/contenido?plan=${planId}&tanda=${t.id}`} className="font-mono text-xs hover:opacity-70">
              {t.creadoEn.slice(0, 16).replace('T', ' ')}
            </Link>
            <span className="text-xs text-(--color-tenue)">{t.notas ? `Notas: ${t.notas}` : 'Sin notas'}</span>
            <span className="text-xs text-(--color-tenue)">{t.modelo}</span>
            <span className="ml-auto text-xs tabular-nums text-(--color-tenue)">{formatearUsd(t.costoUsd)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
