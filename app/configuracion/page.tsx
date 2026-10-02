import { Encabezado, Navegacion } from '@/components/navegacion'
import { PanelEntorno } from '@/components/estado-entorno'
import { revisarEntornoDelProceso } from '@/lib/entorno'

export const dynamic = 'force-dynamic'

export default function Configuracion() {
  const estado = revisarEntornoDelProceso()

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <Navegacion activa="/configuracion" />
      <Encabezado
        fase="Puesta en marcha"
        titulo="Configuración"
        bajada="Qué claves están cargadas y qué funcionalidad destraba cada una. Ninguna clave se muestra acá ni sale del servidor: solo se informa si está presente o no."
      />

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
