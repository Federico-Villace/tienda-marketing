'use client'

import { useState } from 'react'
import Link from 'next/link'
import { postEstimacionPromocion } from '@/components/creativos/api'
import { SubirFoto } from '@/components/creativos/subir-foto'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { usarCompuerta } from '@/components/creativos/compuerta-cliente'
import { formatearUsd } from '@/lib/estratega/formato'
import { INFO_FONDO } from '@/lib/promocion/fondos'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import { ESTILOS, limitesTexto, POSICIONES, PLANTILLAS } from '@/lib/promocion/plantillas'
import { textosParaPlaca } from '@/lib/promocion/textos-placa'
import { ESTILOS_PLACA, esPlantilla, estiloDe, FONDOS, plantillaDe, POSICIONES_MOTO, POSICIONES_TEXTO, posicionTextoDe, type EstiloPlaca, type PosicionMoto, type PosicionTexto, type PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postPlaca } from './api'
import type { FuentesPlaca } from './placa'
import { Alerta, boton, botonPrincipal, campo, Estado, ListaErrores, tarjetaOpcion, TituloPaso, usarAccion } from './ui'
import { VistaPlaca } from './vista-placa'

const VARIANTES = 2
const NOMBRE_MOTO: Record<PosicionMoto, string> = { izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha' }

/**
 * Paso 4 · ¿Cómo querés que se vea? Diseño y fondo; la imagen la genera Gemini por la
 * compuerta de siempre (Ver precio → Confirmar US$ X: nada gasta sin ese click) y el texto
 * lo escribe este paso, determinísticamente: el precio nunca lo dibuja la IA.
 */
export function PasoPlaca({
  promocion: inicial,
  marca,
  fotoUrl,
  escenas,
  placaUrl,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motor,
  fuentes,
  inspiracion,
  comprimirFoto,
}: {
  promocion: PromocionVista
  marca: string
  /** La foto original (para las miniaturas de los diseños). */
  fotoUrl: string | null
  escenas: DetallePromocion['escenas']
  /** La placa final vigente (URL firmada), si hay. */
  placaUrl: string | null
  puedeEditar: boolean
  /** Por qué no se puede generar (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motor: string
  fuentes: FuentesPlaca
  /** La foto de inspiración guardada (URL firmada), si hay. */
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  /** Solo para probar la subida sin un navegador real. */
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
}) {
  const [promocion, setPromocion] = useState(inicial)
  // Si el servidor trae una revisión más nueva (después de un refresh), esa manda.
  if (inicial.revision > promocion.revision) setPromocion(inicial)

  const [titular, setTitular] = useState(promocion.titular ?? promocion.copy?.titular ?? '')
  const [descripcion, setDescripcion] = useState(promocion.fondoDescripcion ?? '')
  const [lineaExtra, setLineaExtra] = useState(promocion.lineaExtra ?? '')
  const [avisos, setAvisos] = useState<string[]>([])
  const [urlFinal, setUrlFinal] = useState(placaUrl)
  const [reutilizada, setReutilizada] = useState(false)
  const accion = usarAccion()
  const compuerta = usarCompuerta(apagado)

  const abierta = promocion.estado === 'borrador'
  const puede = puedeEditar && abierta
  // La vista previa sigue lo que se escribe, aun sin guardar: un campo vacío vuelve al titular del texto elegido.
  const textos = textosParaPlaca({
    marca,
    modelo: promocion.modelo,
    datos: promocion.datos,
    titular: titular.trim() === '' ? promocion.titular : titular.trim(),
    titularDelTexto: promocion.copy?.titular ?? null,
    lineaExtra: lineaExtra.trim() === '' ? null : lineaExtra.trim(),
  })
  const creativos = escenas.flatMap((e) => e.creativos)
  const escenaUrl = creativos.find((c) => c.id === promocion.escenaCreativoId)?.url ?? null
  const listoParaEstimar = promocion.plantilla !== null && promocion.fondo !== null

  async function cambiar(campos: Record<string, unknown>) {
    setAvisos([])
    const r = await accion.correr(() => patchPromocion(promocion.id, { revision: promocion.revision, ...campos }))
    if (!r) return
    setPromocion(r.promocion)
    setAvisos(r.avisos)
  }

  const limites = limitesTexto(esPlantilla(promocion.plantilla) ? posicionTextoDe(promocion.plantilla) : 'abajo')
  const extraConEmoji = /\p{Extended_Pictographic}/u.test(lineaExtra)
  const plantillaActual = esPlantilla(promocion.plantilla) ? promocion.plantilla : null
  const estilo: EstiloPlaca | null = plantillaActual ? estiloDe(plantillaActual) : null
  const posicion: PosicionTexto | null = plantillaActual ? posicionTextoDe(plantillaActual) : null

  /** Estilo y posición componen UN diseño. Al costado la moto no puede quedar al centro: se mueve en el mismo guardado. */
  async function elegirDiseno(e: EstiloPlaca, p: PosicionTexto) {
    const id = plantillaDe(e, p)
    await cambiar({
      plantilla: id,
      fondo: promocion.fondo ?? PLANTILLAS[id].fondoSugerido ?? 'fondo_estudio',
      ...(p === 'costado' && promocion.posicionMoto === 'centro' ? { posicionMoto: 'izquierda' } : {}),
    })
  }

  async function versionFinal() {
    const r = await accion.correr(() => postPlaca(promocion.id, { revision: promocion.revision }))
    if (!r) return
    setPromocion(r.promocion)
    setUrlFinal(r.url)
    setReutilizada(r.reutilizada)
  }

  if (!abierta) {
    return (
      <section>
        <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda="El diseño y la imagen de esta promoción." />
        <Estado>{promocion.estado === 'aprobada' ? 'Está aprobada: para cambiar algo tocá "Volver a editar" en el paso 5.' : 'Esta promoción está descartada.'}</Estado>
      </section>
    )
  }

  return (
    <section>
      <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda="Elegí el diseño y el fondo, generá la imagen y revisá cómo queda con el texto encima." />
      <div className="space-y-8">
        <fieldset role="radiogroup" aria-label="Estilo" disabled={!puede || accion.cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Estilo</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ESTILOS_PLACA.map((id) => (
              <label key={id} className={`${tarjetaOpcion} flex-col`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="estilo" checked={estilo === id} onChange={() => void elegirDiseno(id, posicion ?? 'abajo')} />
                  <span className="font-medium">{ESTILOS[id].nombre}</span>
                </span>
                {fotoUrl && <VistaPlaca decorativa escenaSrc={fotoUrl} textos={textos} plantilla={plantillaDe(id, posicion ?? 'abajo')} posicionMoto={promocion.posicionMoto} aspecto={promocion.aspecto} fuentes={fuentes} />}
                <span className="text-xs text-(--color-tenue)">{ESTILOS[id].descripcion}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset role="radiogroup" aria-label="Dónde va el texto" disabled={!puede || accion.cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Dónde va el texto</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {POSICIONES_TEXTO.map((id) => (
              <label key={id} className={tarjetaOpcion}>
                <input type="radio" name="posicion-texto" checked={posicion === id} onChange={() => void elegirDiseno(estilo ?? 'degradado', id)} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{POSICIONES[id].nombre}</span>
                  <span className="block text-xs text-(--color-tenue)">{POSICIONES[id].descripcion}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-(--color-tenue)">La imagen se genera dejando libre ese sector: si lo cambiás después, conviene generar otra.</p>
        </fieldset>

        <fieldset role="radiogroup" aria-label="Dónde va la moto" disabled={!puede || accion.cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Dónde va la moto</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {POSICIONES_MOTO.map((id) => (
              <label key={id} className={tarjetaOpcion}>
                <input
                  type="radio"
                  name="posicion-moto"
                  checked={promocion.posicionMoto === id}
                  disabled={id === 'centro' && posicion === 'costado'}
                  onChange={() => void cambiar({ posicionMoto: id })}
                  className="mt-1"
                />
                <span className="font-medium">{NOMBRE_MOTO[id]}</span>
              </label>
            ))}
          </div>
          {posicion === 'costado' && <p className="text-xs text-(--color-tenue)">Con el texto al costado, el texto va del lado opuesto a la moto: elegí izquierda o derecha.</p>}
        </fieldset>

        <fieldset role="radiogroup" disabled={!puede || accion.cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Fondo</legend>
          {FONDOS.map((f) => (
            <label key={f} className={tarjetaOpcion}>
              <input type="radio" name="fondo" checked={promocion.fondo === f} onChange={() => void cambiar({ fondo: f })} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{INFO_FONDO[f].nombre}</span>
                <span className="block text-xs text-(--color-tenue)">{INFO_FONDO[f].descripcion}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="promo-descripcion" className="text-sm font-medium">
            Descripción del fondo (opcional)
          </label>
          <textarea
            id="promo-descripcion"
            className={campo}
            rows={3}
            maxLength={300}
            value={descripcion}
            disabled={!puede}
            placeholder="Ej.: una calle de noche con luces cálidas y el cielo despejado"
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <p className="text-xs text-(--color-tenue) tabular-nums">{descripcion.length}/300 · La moto no se modifica: esto solo describe el fondo. Si lo cambiás, conviene generar otra imagen.</p>
          {puedeEditar && (
            <button type="button" className={boton} disabled={!puede || accion.cargando || descripcion.trim() === (promocion.fondoDescripcion ?? '')} onClick={() => void cambiar({ fondoDescripcion: descripcion.trim() === '' ? null : descripcion.trim() })}>
              Guardar descripción
            </button>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Foto de inspiración (opcional)</h3>
          <p className="text-xs text-(--color-tenue)">Una imagen de referencia para copiar el estilo, la luz y el ambiente; la moto es siempre la de tu foto.</p>
          {promocion.inspiracionFotoId && inspiracion ? (
            <div className="flex items-start gap-3">
              {inspiracion.url ? (
                <img src={inspiracion.url} alt="Foto de inspiración" loading="lazy" className="max-h-32 rounded-md border border-(--color-borde)" />
              ) : (
                <p className="text-sm">La foto de inspiración se borró: sacala o subí otra.</p>
              )}
              {puede && (
                <button type="button" className={boton} disabled={accion.cargando} onClick={() => void cambiar({ inspiracionFotoId: null })}>
                  Quitar la foto de inspiración
                </button>
              )}
            </div>
          ) : (
            puede && <SubirFoto puedeEditar uso="inspiracion" {...(comprimirFoto ? { comprimirFoto } : {})} alSubir={(foto) => void cambiar({ inspiracionFotoId: foto.id })} />
          )}
          <p className="text-xs text-(--color-tenue)">Suma una imagen de entrada al precio: lo ves en "Ver precio", antes de gastar.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
          <h3 className="text-sm font-semibold">Generar la imagen</h3>
          <p className="text-xs text-(--color-tenue)">Ver precio no cuesta nada: te muestra cuánto sale antes de gastar. Se generan {VARIANTES} variantes para que elijas.</p>
          {apagado && <Estado>{apagado}</Estado>}
          {puedeEditar && (
            <button
              type="button"
              className={boton}
              disabled={!puede || apagado !== null || compuerta.fase !== 'libre' || !listoParaEstimar}
              onClick={() => void compuerta.pedirEstimacion(() => postEstimacionPromocion({ promocionId: promocion.id, motor, cantidad: VARIANTES }))}
            >
              Ver precio
            </button>
          )}
          {!listoParaEstimar && <p className="text-xs text-(--color-tenue)">Primero elegí el diseño y el fondo.</p>}
          {compuerta.estimacion && (
            <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
              <p className="text-sm">
                {compuerta.estimacion.datos.cantidad} imágenes × ~{formatearUsd(compuerta.estimacion.datos.porImagenUsd)} (precio de lista {formatearUsd(compuerta.estimacion.datos.listaUsd)}). El tope incluye el pensamiento y
                la entrada del modelo; el costo real puede ser menor.
              </p>
              {compuerta.estimacion.datos.conInspiracion && <p className="text-xs text-(--color-tenue)">Incluye la foto de inspiración.</p>}
              {topeUsd !== null && <p className="text-xs text-(--color-tenue)">Este mes ya se gastaron {formatearUsd(gastadoUsd)} de {formatearUsd(topeUsd)}.</p>}
              {compuerta.estimacion.excede && (
                <p className="text-sm text-(--color-falta)">Esta generación supera lo que queda del tope mensual: no se puede confirmar.</p>
              )}
              <button type="button" className={botonPrincipal} disabled={compuerta.fase !== 'libre' || compuerta.estimacion.excede || compuerta.estimacion.bloqueada} onClick={() => void compuerta.confirmar()}>
                {compuerta.fase === 'corriendo' ? 'Generando… hasta 2 min' : `Confirmar ${formatearUsd(compuerta.estimacion.datos.costoEstimadoUsd)}`}
              </button>
              {compuerta.fase !== 'corriendo' && <p className="text-xs text-(--color-tenue)">Recién acá se cobra. La estimación vence en 15 minutos.</p>}
            </div>
          )}
          {compuerta.costoReal !== null && <p role="status" className="text-sm">Listo. Costo real: {formatearUsd(compuerta.costoReal)}. Elegí una imagen abajo.</p>}
          {compuerta.error && <Alerta>{compuerta.error}</Alerta>}
        </div>

        <fieldset role="radiogroup" disabled={!puede || accion.cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Imagen</legend>
          {creativos.length === 0 ? (
            <p className="text-sm text-(--color-tenue)">Todavía no generaste ninguna imagen para esta promoción.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {creativos.map((c, i) =>
                c.url ? (
                  <label key={c.id} className={`${tarjetaOpcion} flex-col`}>
                    <img src={c.url} alt={`Imagen generada ${i + 1}`} loading="lazy" className="w-full rounded-md" />
                    <span className="flex items-center gap-2">
                      <input type="radio" name="escena" checked={promocion.escenaCreativoId === c.id} onChange={() => void cambiar({ escenaCreativoId: c.id })} />
                      <span>Usar esta imagen</span>
                    </span>
                  </label>
                ) : (
                  <p key={c.id} className="rounded-lg border border-(--color-borde) px-3 py-2 text-xs text-(--color-tenue)">
                    {c.error ?? 'Esta imagen no se pudo generar.'}
                  </p>
                ),
              )}
            </div>
          )}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="promo-titular" className="text-sm font-medium">
            Titular
          </label>
          <input id="promo-titular" className={campo} value={titular} maxLength={limites.titular} disabled={!puede} onChange={(e) => setTitular(e.target.value)} />
          <p className="text-xs text-(--color-tenue) tabular-nums">{titular.length}/{limites.titular} · Sin precios ni números: el precio va aparte.</p>
          {puedeEditar && (
            <button type="button" className={boton} disabled={!puede || accion.cargando || titular.trim() === '' || titular.trim() === promocion.titular} onClick={() => void cambiar({ titular: titular.trim() })}>
              Guardar titular
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="promo-extra" className="text-sm font-medium">
            Línea extra (opcional)
          </label>
          <input
            id="promo-extra"
            className={campo}
            value={lineaExtra}
            maxLength={limites.extra}
            disabled={!puede}
            placeholder="Ej.: Hot Sale · Solo este fin de semana"
            onChange={(e) => setLineaExtra(e.target.value)}
          />
          <p className="text-xs text-(--color-tenue) tabular-nums">
            {lineaExtra.length}/{limites.extra} · Va debajo del titular. El único precio es el que cargaste.
          </p>
          {extraConEmoji && <p className="text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
          {puedeEditar && (
            <button
              type="button"
              className={boton}
              disabled={!puede || accion.cargando || extraConEmoji || lineaExtra.trim() === (promocion.lineaExtra ?? '')}
              onClick={() => void cambiar({ lineaExtra: lineaExtra.trim() === '' ? null : lineaExtra.trim() })}
            >
              Guardar línea extra
            </button>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Así queda</h3>
          {escenaUrl ? (
            <div className="mx-auto max-w-sm">
              <VistaPlaca escenaSrc={escenaUrl} textos={textos} plantilla={esPlantilla(promocion.plantilla) ? promocion.plantilla : 'oferta_abajo'} posicionMoto={promocion.posicionMoto} aspecto={promocion.aspecto} fuentes={fuentes} />
            </div>
          ) : (
            <p className="text-sm text-(--color-tenue)">Elegí una imagen para ver cómo queda con el texto.</p>
          )}
          <p className="text-xs text-(--color-tenue)">Es una vista previa aproximada. La imagen final se arma al tocar el botón de abajo.</p>
          {puedeEditar && (
            <button type="button" className={boton} disabled={!puede || accion.cargando || !promocion.escenaCreativoId || !promocion.plantilla} onClick={() => void versionFinal()}>
              Ver la versión final
            </button>
          )}
          {accion.cargando && <p role="status" className="text-sm text-(--color-tenue)">Trabajando…</p>}
          {promocion.placaLista && urlFinal && (
            <figure className="mx-auto max-w-sm space-y-1">
              <img src={urlFinal} alt={`Imagen final de ${promocion.modelo}`} className="w-full rounded-md border border-(--color-borde)" />
              <figcaption className="text-xs text-(--color-tenue)">{reutilizada ? 'Ya estaba armada: no cambió nada.' : 'Imagen final lista.'}</figcaption>
            </figure>
          )}
        </div>

        {avisos.length > 0 && <Estado>{avisos.join(' ')}</Estado>}
        <ListaErrores errores={accion.errores} conflicto={accion.conflicto} alRecargar={accion.recargar} />

        {promocion.placaLista && (
          <Link href={`/promocionar/${promocion.id}?paso=5`} className={`${botonPrincipal} inline-block`}>
            Seguir a aprobar
          </Link>
        )}
      </div>
    </section>
  )
}
