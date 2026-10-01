import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'

const COLA = [
  ['Reel · 999motos', 'Lun 06, 19:00', 'Borrador', '¿Cuánto gastás por mes en colectivo? Te muestro la cuenta.'],
  ['Carrusel · 999motos', 'Mar 07, 13:00', 'En revisión', '5 cosas que nadie te cuenta antes de comprar tu primera 0km'],
  ['Reel · Suzuki Quilmes', 'Jue 09, 19:30', 'Aprobada', 'Entregamos 3 unidades esta semana. Mirá las caras.'],
  ['Posteo · Motoplex Quilmes', 'Vie 10, 11:00', 'Publicada', 'Financiación en 12 cuotas fijas. Consultá por mensaje.'],
]

const COLOR: Record<string, string> = {
  Borrador: 'text-(--color-tenue)',
  'En revisión': 'text-(--color-aviso)',
  Aprobada: 'text-(--color-ok)',
  Publicada: 'text-(--color-ok)',
}

export default function Publicaciones() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/publicaciones" />
      <Encabezado
        fase="Fase 4"
        titulo="Cola de publicación"
        bajada="Última instancia: se edita, se aprueba y recién ahí se publica. Ninguna pieza sale a la calle sin que una persona le dé el OK."
      />
      <Aviso>
        Pantalla de muestra. El permiso <code className="font-mono">instagram_content_publish</code>{' '}
        ya está aprobado en la app del cliente: la publicación real no necesita App Review.
      </Aviso>

      <ul className="space-y-2">
        {COLA.map(([pieza, cuando, estado, copy]) => (
          <li key={String(pieza)} className="rounded-lg border border-(--color-borde) px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{pieza}</span>
              <span className={`text-xs ${COLOR[String(estado)] ?? ''}`}>{estado}</span>
            </div>
            <p className="mt-1.5 text-sm text-(--color-tenue)">{copy}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-(--color-tenue)">{cuando}</span>
              <span className="flex-1" />
              {['Editar', 'Aprobar', 'Publicar'].map((accion) => (
                <button
                  key={accion}
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-(--color-borde) px-2.5 py-1 text-xs opacity-50"
                >
                  {accion}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-(--color-tenue)">
        Instagram publica en dos pasos: primero se crea un contenedor
        (<code className="font-mono">/media</code>) y después se publica
        (<code className="font-mono">/media_publish</code>). La edición y la
        aprobación viven entre esos dos pasos. Límite: 100 publicaciones por API
        cada 24 h por cuenta.
      </p>
    </main>
  )
}
