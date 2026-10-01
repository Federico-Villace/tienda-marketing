import Link from 'next/link'
import { Navegacion } from '@/components/navegacion'
import { PanelEntorno } from '@/components/estado-entorno'
import { revisarEntornoDelProceso } from '@/lib/entorno'

export const dynamic = 'force-dynamic'

export default function Inicio() {
  const estado = revisarEntornoDelProceso()

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <header className="mb-10">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          Fase 1 · MVP
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Agencia de marketing con agentes
        </h1>
        <p className="mt-3 text-(--color-tenue)">
          Estado de la configuración. Esta pantalla es un tablero de puesta en
          marcha, no la app: se reemplaza por el tablero de datos cuando termine
          la ingesta.
        </p>
        <Link
          href="/tablero"
          className="mt-4 inline-block rounded-md border border-(--color-borde) px-3 py-1.5 text-sm underline-offset-4 hover:underline"
        >
          Ver el tablero →
        </Link>
      </header>

      <PanelEntorno estado={estado} />

      <section className="mt-12 border-t border-(--color-borde) pt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Cómo completar
        </h2>
        <ol className="space-y-2 text-sm text-(--color-tenue)">
          <li>
            1 · <code className="font-mono">cp env.example .env.local</code>
          </li>
          <li>2 · Completar los valores y reiniciar el servidor.</li>
          <li>
            3 · Verificar los accesos de Meta con{' '}
            <code className="font-mono">
              ./scripts/verificar-permisos-meta.sh
            </code>
          </li>
        </ol>
        <p className="mt-4 text-xs text-(--color-tenue)">
          Ninguna clave se muestra en esta pantalla ni sale del servidor: solo se
          informa si está presente o no.
        </p>
      </section>
    </main>
  )
}
