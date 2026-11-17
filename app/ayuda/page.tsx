import type { Metadata } from 'next'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { SeccionManual } from '@/components/ayuda/texto-ayuda'
import { BAJADA_AYUDA, SECCIONES_AYUDA, TITULO_AYUDA } from '@/lib/ayuda/contenido'

export const metadata: Metadata = { title: `${TITULO_AYUDA} · 999 Motos` }

/**
 * Manual de uso. Es solo texto (lib/ayuda/contenido.ts), sin datos de la base: lo ven todos los roles, lector incluido.
 * Pide sesión como el resto de la app: lo garantiza proxy.ts, que cubre toda ruta que no sea /login ni los crons.
 */
export default function Ayuda() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <Navegacion activa="/ayuda" />
      <Encabezado titulo={TITULO_AYUDA} bajada={BAJADA_AYUDA} />

      <nav aria-label="Contenido del manual" className="mb-10 rounded-lg border border-(--color-borde) px-4 py-3">
        <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Qué hay en esta página</h2>
        <ol className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
          {SECCIONES_AYUDA.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex min-h-11 items-center gap-2 underline-offset-4 hover:underline sm:min-h-8">
                <span className="w-5 shrink-0 font-mono text-xs text-(--color-tenue)">{i + 1}</span>
                {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10">
        {SECCIONES_AYUDA.map((s, i) => (
          <SeccionManual key={s.id} seccion={s} numero={i + 1} />
        ))}
      </div>

      <p className="mt-12 border-t border-(--color-borde) pt-6 text-sm text-(--color-tenue)">
        ¿Algo no se entiende o falta? Avisale a Federico y lo sumamos a esta página.
      </p>
    </main>
  )
}
