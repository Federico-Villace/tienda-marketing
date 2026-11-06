'use client'

import { useRef, useState } from 'react'
import { descargar, descargarTodas, type DepsDescarga, type ItemDescarga, type ResultadoDescarga } from '@/lib/descargas/descargar'
import { depsDelNavegador } from '@/lib/descargas/navegador'
import { lineaPromo } from '@/lib/promocion/datos'
import { textosParaPlaca } from '@/lib/promocion/textos-placa'
import { esPlantilla, type PromocionVista } from '@/lib/promocion/tipos'
import { Lightbox } from '@/components/ui/lightbox'
import type { FuentesPlaca } from './placa'
import { boton } from './ui'
import { VistaPlaca } from './vista-placa'

export type PiezaDeGrilla = {
  promocion: PromocionVista
  marca: string
  /** La imagen elegida para esta pieza (URL), si hay. */
  escenaUrl: string | null
  /** Link para bajar la placa final: solo si está aprobada. */
  descarga: string | null
  /** La placa final (aprobada). */
  placaFinal: string | null
}

const slug = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const itemDe = (p: PiezaDeGrilla): ItemDescarga => ({ url: p.descarga!, nombre: `${slug(p.promocion.modelo) || 'promocion'}-${slug(p.marca)}-${p.promocion.aspecto.replace(':', 'x')}.png` })

const ESTADO: Record<PromocionVista['estado'], string> = { borrador: 'Borrador', aprobada: 'Aprobada', descartada: 'Descartada' }

/**
 * Todas las placas de la tanda juntas, para compararlas de un vistazo y bajar las aprobadas.
 * La vista previa es la misma placa en vivo del paso 4 (gratis, no llama a nadie). Bajar es un click
 * explícito: de a una en escritorio y con el menú de compartir en el celu.
 */
export function GrillaComparacion({ piezas, fuentes, deps }: { piezas: readonly PiezaDeGrilla[]; fuentes: FuentesPlaca; deps?: DepsDescarga }) {
  const bajables = piezas.filter((p) => p.descarga !== null)
  const [bajando, setBajando] = useState(false)
  const enCurso = useRef(false)
  const [resultado, setResultado] = useState<ResultadoDescarga | null>(null)

  async function bajar(accion: (d: DepsDescarga) => Promise<ResultadoDescarga>) {
    if (enCurso.current) return
    enCurso.current = true
    setBajando(true)
    try {
      setResultado(await accion(deps ?? depsDelNavegador()))
    } finally {
      enCurso.current = false
      setBajando(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={boton} disabled={bajando || bajables.length === 0} onClick={() => void bajar((d) => descargarTodas(bajables.map(itemDe), d))}>
          Descargar todas ({bajables.length})
        </button>
        <p className="text-xs text-(--color-tenue)">Se bajan las aprobadas, una por una. Si el navegador pregunta si permitís varias descargas, decile que sí.</p>
      </div>
      {resultado?.aviso && (
        <p role="status" className="text-sm">
          {resultado.aviso}
        </p>
      )}
      <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {piezas.map((p) => (
          <Tarjeta key={p.promocion.id} pieza={p} fuentes={fuentes} bajando={bajando} alBajar={(item) => void bajar((d) => descargar(item, d))} />
        ))}
      </ul>
    </div>
  )
}

function Tarjeta({ pieza: p, fuentes, bajando, alBajar }: { pieza: PiezaDeGrilla; fuentes: FuentesPlaca; bajando: boolean; alBajar: (i: ItemDescarga) => void }) {
  const [ampliada, setAmpliada] = useState(false)
  const pr = p.promocion
  const textos = textosParaPlaca({ marca: p.marca, modelo: pr.modelo, datos: pr.datos, titular: pr.titular, titularDelTexto: pr.copy?.titular ?? null, lineaExtra: pr.lineaExtra })
  const plantilla = esPlantilla(pr.plantilla) ? pr.plantilla : null
  const enVivo = p.escenaUrl !== null && plantilla !== null
  const imagen = () =>
    p.placaFinal ? (
      <img src={p.placaFinal} alt={`Placa final de ${p.marca}`} className="w-full rounded-md border border-(--color-borde)" />
    ) : enVivo ? (
      <VistaPlaca escenaSrc={p.escenaUrl!} textos={textos} plantilla={plantilla!} posicionMoto={pr.posicionMoto} aspecto={pr.aspecto} fuentes={fuentes} />
    ) : null
  const hayImagen = p.placaFinal !== null || enVivo
  return (
    <li className="min-w-0 space-y-2 rounded-lg border border-(--color-borde) p-3">
      {hayImagen ? (
        <>
          {imagen()}
          <button type="button" className={boton} onClick={() => setAmpliada(true)} aria-label={`Ampliar la placa de ${p.marca}`}>
            Ampliar
          </button>
          <Lightbox abierto={ampliada} alCerrar={() => setAmpliada(false)} titulo={`Placa de ${p.marca}`}>
            {imagen()}
          </Lightbox>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-(--color-borde) px-3 py-10 text-center text-xs text-(--color-tenue)">Falta elegir la imagen y el diseño.</p>
      )}
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-semibold break-words">{p.marca}</p>
        <p className="break-words">{textos.titular || 'Sin titular todavía'}</p>
        <p className="text-xs text-(--color-tenue) tabular-nums">
          {textos.precio} · {lineaPromo(pr.datos.promo) || 'Sin promo'}
        </p>
        <p className="text-xs text-(--color-tenue)">{ESTADO[pr.estado]}</p>
      </div>
      {p.descarga && (
        <button type="button" className={boton} disabled={bajando} onClick={() => alBajar(itemDe(p))}>
          Descargar
        </button>
      )}
    </li>
  )
}
