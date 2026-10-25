'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { textoPublicado } from '@/lib/contenidista/limites'
import type { PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion } from './api'
import { boton, botonPrincipal, campo, Estado, ListaErrores, TituloPaso, usarAccion } from './ui'

/**
 * Paso 6 · ¡Listo! La imagen para bajar y el texto para copiar. Publicar en Meta es de la
 * próxima etapa (fase 4): por ahora se sube a mano.
 */
export function PasoFinal({
  promocion,
  placa,
  puedeEditar,
}: {
  promocion: PromocionVista
  placa: { url: string | null; descarga: string | null } | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const accion = usarAccion()
  const [aviso, setAviso] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const texto = promocion.copy ? textoPublicado(promocion.copy) : ''

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(texto)
      setManual(false)
      setAviso('Texto copiado.')
    } catch {
      // Sin permiso o sin API: se deja el texto a la vista, seleccionado.
      setManual(true)
      setAviso('No pudimos copiar solo. Copialo a mano: está seleccionado abajo.')
      setTimeout(() => area.current?.select(), 0)
    }
  }

  async function reabrir() {
    const r = await accion.correr(() => patchPromocion(promocion.id, { revision: promocion.revision, accion: 'reabrir' }))
    if (r) router.push(`/promocionar/${promocion.id}?paso=4`)
  }

  return (
    <section>
      <TituloPaso numero={6} pregunta="¡Listo! Tu promoción está aprobada" leyenda="Bajá la imagen y copiá el texto." />
      <div className="space-y-5">
        {placa?.url ? (
          <figure className="mx-auto max-w-sm">
            <img src={placa.url} alt={`Imagen final de ${promocion.modelo}`} className="w-full rounded-md border border-(--color-borde)" />
          </figure>
        ) : (
          <Estado>No se pudo mostrar la imagen ahora. Volvé a abrir esta pantalla en un momento.</Estado>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {placa?.descarga && (
            <a href={placa.descarga} download className={botonPrincipal}>
              Descargar imagen
            </a>
          )}
          <button type="button" className={boton} onClick={() => void copiar()}>
            Copiar texto
          </button>
        </div>

        {aviso && (
          <p role="status" className="text-center text-sm">
            {aviso}
          </p>
        )}
        {manual && (
          <div>
            <label htmlFor="texto-para-copiar" className="text-sm font-medium">
              Texto para copiar
            </label>
            <textarea id="texto-para-copiar" ref={area} readOnly rows={8} className={campo} value={texto} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}

        <p className="rounded-md border border-(--color-aviso) px-3 py-2 text-center text-sm text-(--color-aviso)">Publicar en Meta llega en la próxima etapa (fase 4): por ahora subí la imagen y el texto a mano.</p>
        <ListaErrores errores={accion.errores} conflicto={accion.conflicto} alRecargar={accion.recargar} />

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-(--color-borde) pt-5">
          <Link href="/promocionar/nueva" className={boton}>
            Armar otra promoción
          </Link>
          <Link href="/promocionar" className={boton}>
            Ver todas las promociones
          </Link>
          {puedeEditar && (
            <button type="button" className={boton} disabled={accion.cargando} onClick={() => void reabrir()}>
              Volver a editar
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
