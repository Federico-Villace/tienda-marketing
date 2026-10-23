'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemMenuFoto } from '@/lib/productor/ediciones'
import type { FotoVista } from '@/lib/productor/pantalla'
import { deleteFoto } from './api'
import { Galeria } from './galeria'
import { MenuFoto } from './menu-foto'
import type { MotorImagen } from './productor'
import { SubirFoto } from './subir-foto'

const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * "Tus fotos": subir, elegir una, ver su menú de ediciones con precio y los
 * resultados. Se usa <img> a propósito (URLs firmadas de vida corta, igual que
 * la galería). Los resultados de una foto no se "eligen" todavía.
 */
export function Fotos({
  fotos,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motores,
  motorPorDefecto,
  menuPorMotor,
}: {
  fotos: readonly FotoVista[]
  puedeEditar: boolean
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motores: readonly MotorImagen[]
  motorPorDefecto: string
  menuPorMotor: Readonly<Record<string, readonly ItemMenuFoto[]>>
}) {
  const router = useRouter()
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const foto = fotos.find((x) => x.id === seleccionada) ?? null

  async function borrar(id: string) {
    if (borrando) return
    setBorrando(true)
    setError(null)
    const r = await deleteFoto(id)
    setBorrando(false)
    setConfirmandoBorrado(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setSeleccionada(null)
    if (r.pendiente) setAviso('La foto quedó marcada como borrada, pero su archivo no se pudo eliminar todavía: queda pendiente.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <p role="note" className="rounded-lg border border-(--color-borde) px-4 py-2.5 text-sm text-(--color-tenue)">
        Revisá que la moto no haya cambiado: forma, color y logos. La foto original nunca se publica ni se comparte; solo se manda
        a Gemini para editarla.
      </p>

      <SubirFoto puedeEditar={puedeEditar} />

      {aviso && (
        <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
          {aviso}
        </p>
      )}

      {fotos.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">Todavía no subiste ninguna foto.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {fotos.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                aria-label={`Elegir la foto ${x.creadoEn.slice(0, 16).replace('T', ' ')}`}
                aria-pressed={x.id === seleccionada}
                onClick={() => {
                  setSeleccionada(x.id)
                  setConfirmandoBorrado(false)
                  setError(null)
                }}
                className={`block w-full overflow-hidden rounded-lg border ${x.id === seleccionada ? 'border-(--color-ok)' : 'border-(--color-borde)'}`}
              >
                {x.url ? (
                  <img src={x.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="block px-2 py-6 text-center text-xs text-(--color-tenue)">Sin vista previa</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {foto && (
        <div className="space-y-4">
          <MenuFoto
            key={foto.id}
            foto={foto}
            puedeEditar={puedeEditar}
            apagado={apagado}
            topeUsd={topeUsd}
            gastadoUsd={gastadoUsd}
            motores={motores}
            motorPorDefecto={motorPorDefecto}
            menuPorMotor={menuPorMotor}
          />

          <Galeria
            pieza={{ pieza: { altText: 'Foto de la moto editada' }, generaciones: foto.generaciones, creativos: foto.creativos }}
            puedeEditar={puedeEditar}
            elegible={false}
          />

          {puedeEditar && (
            <div className="space-y-2">
              {confirmandoBorrado ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Se borra el original; las imágenes ya generadas se conservan.</span>
                  <button type="button" className={boton} disabled={borrando} onClick={() => void borrar(foto.id)}>
                    Sí, borrar
                  </button>
                  <button type="button" className={boton} disabled={borrando} onClick={() => setConfirmandoBorrado(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" className={boton} onClick={() => setConfirmandoBorrado(true)}>
                  Borrar foto
                </button>
              )}
              {error && (
                <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
