import { lineaPromo } from '@/lib/promocion/datos'
import { textosParaPlaca } from '@/lib/promocion/textos-placa'
import { esPlantilla, type PromocionVista } from '@/lib/promocion/tipos'
import { ImagenAmpliable } from '@/components/ui/lightbox'
import type { FuentesPlaca } from './placa'
import { VistaPlaca } from './vista-placa'

/**
 * La columna fija de los pasos que no son el 4: qué se está armando (moto, precio, promo) y cómo viene
 * quedando la placa. Solo mira: ni un control, así que el lector la ve igual que quien edita.
 */
export function ResumenPromocion({
  promocion,
  marca,
  escenaUrl,
  placaUrl,
  fuentes,
}: {
  promocion: PromocionVista
  marca: string
  /** La imagen elegida para el fondo (URL), si hay. */
  escenaUrl: string | null
  /** La placa final armada (URL), si hay. */
  placaUrl: string | null
  fuentes: FuentesPlaca
}) {
  const textos = textosParaPlaca({ marca, modelo: promocion.modelo, datos: promocion.datos, titular: promocion.titular, titularDelTexto: promocion.copy?.titular ?? null, lineaExtra: promocion.lineaExtra })
  const plantilla = esPlantilla(promocion.plantilla) ? promocion.plantilla : null
  return (
    <>
      <h3 className="text-sm font-semibold">Tu promoción</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-(--color-tenue)">Moto</dt>
        <dd className="min-w-0 break-words">{promocion.modelo}</dd>
        <dt className="text-(--color-tenue)">Precio</dt>
        <dd className="tabular-nums">{textos.precio}</dd>
        <dt className="text-(--color-tenue)">Promo</dt>
        <dd className="min-w-0 break-words">{lineaPromo(promocion.datos.promo) || 'Sin promo'}</dd>
      </dl>
      {placaUrl ? (
        <div className="mx-auto max-w-sm">
          <ImagenAmpliable src={placaUrl} alt={`Imagen final de ${promocion.modelo}`} className="border border-(--color-borde)" />
        </div>
      ) : escenaUrl && plantilla ? (
        <div className="mx-auto max-w-sm">
          <VistaPlaca escenaSrc={escenaUrl} textos={textos} plantilla={plantilla} posicionMoto={promocion.posicionMoto} aspecto={promocion.aspecto} fuentes={fuentes} promocion={{ marcaId: promocion.marcaId, datos: promocion.datos, diseno: promocion.diseno }} />
        </div>
      ) : (
        <p className="text-sm text-(--color-tenue)">La placa aparece acá cuando elijas la imagen y el diseño (paso 4).</p>
      )}
    </>
  )
}
