'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import { comprimir, depsDeNavegador, type ResultadoCompresion } from '@/lib/productor/redimensionar'
import { postFotoConProgreso, type FotoSubida } from './api'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'

const boton =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

const comprimirEnNavegador = (archivo: File): Promise<ResultadoCompresion> => comprimir(archivo, depsDeNavegador())

/**
 * Sube la foto real de una moto. El navegador la decodifica (aplicando la
 * orientación EXIF), la achica a 2048 px y la re-encodea a JPEG: así se va el
 * EXIF/GPS y entra en el límite de Vercel. El servidor igual la revalida.
 * Sin la declaración de derechos tildada no hay botón. Subir no gasta plata.
 */
export function SubirFoto({
  puedeEditar,
  alSubir,
  uso = 'moto',
  comprimirFoto = comprimirEnNavegador,
}: {
  puedeEditar: boolean
  alSubir?: (foto: FotoSubida) => void
  /** moto (por defecto) o inspiración: el camino es el mismo, el servidor las distingue. */
  uso?: 'moto' | 'inspiracion'
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
}) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [derechos, setDerechos] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [etapa, setEtapa] = useState<'comprimiendo' | 'subiendo'>('comprimiendo')
  const [progreso, setProgreso] = useState(0)
  // La foto ya achicada: si la subida falla, "Reintentar" la manda de nuevo sin elegirla ni achicarla otra vez.
  const comprimida = useRef<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)
  const vistaActual = useRef<string | null>(null)

  if (!puedeEditar) {
    return <AvisoSoloVer />
  }

  function elegir(f: File | null) {
    setError(null)
    comprimida.current = null
    setArchivo(f)
    if (vistaActual.current) URL.revokeObjectURL(vistaActual.current)
    let url: string | null = null
    try {
      url = f ? URL.createObjectURL(f) : null
    } catch {
      // Sin vista previa el flujo sigue igual.
    }
    vistaActual.current = url
    setVista(url)
  }

  async function subir() {
    if (enCurso.current || !archivo || !derechos) return
    enCurso.current = true
    setSubiendo(true)
    setError(null)
    setProgreso(0)
    if (!comprimida.current) {
      setEtapa('comprimiendo')
      const c = await comprimirFoto(archivo)
      if (!c.ok) {
        enCurso.current = false
        setSubiendo(false)
        setError(c.error)
        return
      }
      comprimida.current = c.blob
    }
    setEtapa('subiendo')
    const formulario = new FormData()
    formulario.set('foto', comprimida.current, 'foto.jpg')
    formulario.set('derechos', 'acepto')
    if (uso !== 'moto') formulario.set('uso', uso)
    const r = await postFotoConProgreso(formulario, setProgreso)
    enCurso.current = false
    setSubiendo(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    elegir(null)
    setDerechos(false)
    alSubir?.(r.foto)
    router.refresh()
  }

  return (
    <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          elegir(e.dataTransfer.files[0] ?? null)
        }}
        className="rounded-lg border border-dashed border-(--color-borde) px-4 py-6 text-center"
      >
        <label className="block cursor-pointer text-sm text-(--color-tenue)">
          {uso === 'inspiracion' ? 'Elegir una foto de inspiración (o arrastrala acá)' : 'Elegir una foto de la moto (o arrastrala acá)'}
          <input
            type="file"
            accept="image/*"
            className="mt-2 block w-full text-xs"
            disabled={subiendo}
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
        </label>
        {vista && <img src={vista} alt="Vista previa de la foto elegida" className="mx-auto mt-3 max-h-48 rounded-md object-cover" />}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={derechos} disabled={subiendo} onChange={(e) => setDerechos(e.target.checked)} className="mt-1" />
        {DECLARACION_DERECHOS_V1.texto}
      </label>

      <button type="button" className={boton} disabled={!archivo || !derechos || subiendo} onClick={() => void subir()}>
        {subiendo ? 'Subiendo…' : 'Subir'}
      </button>

      {subiendo && (
        <div className="space-y-1">
          {etapa === 'comprimiendo' ? (
            <p role="status" className="text-xs text-(--color-tenue)">Preparando la foto…</p>
          ) : (
            <>
              <div role="progressbar" aria-label="Subiendo la foto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso} className="h-2 w-full overflow-hidden rounded-full bg-(--color-borde)">
                <div className="h-full bg-(--color-ok) transition-[width]" style={{ width: `${progreso}%` }} />
              </div>
              <p className="text-xs text-(--color-tenue) tabular-nums">Subiendo… {progreso}%</p>
            </>
          )}
        </div>
      )}

      {archivo && !subiendo && !error && (
        <p role="status" className="text-xs text-(--color-aviso)">
          {derechos ? 'Elegiste una foto: apretá Subir para usarla.' : 'Elegiste una foto: tildá la declaración y apretá Subir para usarla.'}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {error && comprimida.current && (
        <button type="button" className={boton} disabled={subiendo} onClick={() => void subir()}>
          Reintentar
        </button>
      )}
    </div>
  )
}
