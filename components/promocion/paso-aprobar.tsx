'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { textoPublicado } from '@/lib/contenidista/limites'
import type { PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion } from './api'
import { boton, botonPrincipal, Estado, ListaErrores, TituloPaso, usarAccion } from './ui'

const RECORTE = 125

/**
 * Paso 5 · ¿Está todo bien? Una vista previa del posteo (imagen final + texto) y dos
 * salidas: Aprobar —queda guardado tal cual— o Volver a editar. Aprobar es gratis; si la
 * imagen final no está al día, el servidor la arma en ese momento.
 */
export function PasoAprobar({
  promocion,
  marca,
  placaUrl,
  puedeEditar,
}: {
  promocion: PromocionVista
  marca: { nombre: string; usuarioIg: string }
  placaUrl: string | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const accion = usarAccion()
  const [abierto, setAbierto] = useState(false)
  const [descartando, setDescartando] = useState(false)

  const copy = promocion.copy
  const aprobada = promocion.estado === 'aprobada'
  const puede = puedeEditar && promocion.estado === 'borrador'
  const texto = copy?.copy ?? ''
  const largo = texto.length > RECORTE
  const pendiente = copy !== null && [copy.titular, copy.hook, copy.copy, copy.cta, copy.altText, ...copy.hashtags].some((t) => t.includes('[precio]'))

  async function correr(a: 'aprobar' | 'reabrir' | 'descartar', destino: string) {
    const r = await accion.correr(() => patchPromocion(promocion.id, { revision: promocion.revision, accion: a }))
    if (r) router.push(destino)
  }

  return (
    <section>
      <TituloPaso numero={5} pregunta="¿Está todo bien?" leyenda="Así se va a ver el posteo. Si lo aprobás, queda guardado tal cual." />
      <div className="space-y-5">
        <article className="mx-auto max-w-sm rounded-lg border border-(--color-borde)" aria-label="Vista previa del posteo">
          <header className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-(--color-borde) text-sm font-semibold">
              {marca.nombre.charAt(0)}
            </span>
            <span className="text-sm font-semibold">@{marca.usuarioIg}</span>
          </header>
          {placaUrl ? (
            <img src={placaUrl} alt={`Imagen del posteo de ${promocion.modelo}`} className="w-full" />
          ) : (
            <p className="px-3 py-10 text-center text-sm text-(--color-tenue)">La imagen final se arma al aprobar.</p>
          )}
          <div className="space-y-1 px-3 py-3 text-sm">
            <p className="whitespace-pre-wrap">
              <span className="font-semibold">{marca.usuarioIg}</span> {largo && !abierto ? `${texto.slice(0, RECORTE).trimEnd()}…` : texto}{' '}
              {largo && (
                <button type="button" className="text-(--color-tenue) hover:opacity-70" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
                  {abierto ? 'menos' : 'más'}
                </button>
              )}
            </p>
            {copy && <p className="text-(--color-tenue)">{copy.hashtags.join(' ')}</p>}
          </div>
        </article>

        {pendiente && <Estado>Hay un [precio] sin completar en el texto: volvé al paso 3, editalo y escribí el monto antes de aprobar.</Estado>}
        {copy && textoPublicado(copy).length > 0 && <p className="text-center text-xs text-(--color-tenue)">Texto de {textoPublicado(copy).length} caracteres con los hashtags.</p>}

        <ListaErrores errores={accion.errores} conflicto={accion.conflicto} alRecargar={accion.recargar} />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {puede && (
            <button type="button" className={botonPrincipal} disabled={accion.cargando} onClick={() => void correr('aprobar', `/promocionar/${promocion.id}?paso=6`)}>
              {accion.cargando ? 'Aprobando…' : 'Aprobar'}
            </button>
          )}
          {promocion.estado === 'borrador' && (
            <Link href={`/promocionar/${promocion.id}?paso=4`} className={boton}>
              Volver a editar
            </Link>
          )}
          {aprobada && (
            <>
              <Link href={`/promocionar/${promocion.id}?paso=6`} className={botonPrincipal}>
                Ver el resultado
              </Link>
              {puedeEditar && (
                <button type="button" className={boton} disabled={accion.cargando} onClick={() => void correr('reabrir', `/promocionar/${promocion.id}?paso=4`)}>
                  Volver a editar
                </button>
              )}
            </>
          )}
        </div>

        {puede && (
          <div className="text-center">
            {descartando ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-2 text-sm">
                ¿Seguro? No se borra nada, pero sale de la lista.
                <button type="button" className={boton} disabled={accion.cargando} onClick={() => void correr('descartar', '/promocionar')}>
                  Sí, descartar
                </button>
                <button type="button" className={boton} onClick={() => setDescartando(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="text-sm text-(--color-tenue) underline hover:opacity-70" onClick={() => setDescartando(true)}>
                Descartar promoción
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
