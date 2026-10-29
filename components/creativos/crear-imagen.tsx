'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CompuertaImagen, GastoDelMes } from '@/components/imagenes/compuerta-imagen'
import { OpcionesImagen, type InspiracionVista } from '@/components/imagenes/opciones-imagen'
import { faltaPedidoDeFondo, MENSAJE_FALTA_DESCRIPCION } from '@/lib/imagenes/fondos'
import type { OpcionesImagen as Opciones } from '@/lib/imagenes/opciones'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import type { FotoVista, PiezaImagenVista } from '@/lib/productor/pantalla'
import { deleteFoto, postEstimacion, postEstimacionFoto } from './api'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { SubirFoto } from './subir-foto'

type Origen = 'foto' | 'texto'

import { boton, campo, tarjetaOpcion } from '@/components/promocion/ui'

const FORMATOS: Record<AspectoFoto, string> = {
  '1:1': 'Cuadrado 1:1 · feed',
  '4:5': 'Vertical 4:5 · feed',
  '9:16': 'Historia 9:16',
}

const fechaCorta = (iso: string) => iso.slice(0, 16).replace('T', ' ')

/** Un grupo de radios con nombre (fieldset + legend). Deshabilitado, deshabilita todas sus opciones. */
function Grupo({ leyenda, deshabilitado, children }: { leyenda: string; deshabilitado: boolean; children: ReactNode }) {
  return (
    <fieldset role="radiogroup" disabled={deshabilitado} className="min-w-0 space-y-2">
      <legend className="mb-1 text-sm font-medium">{leyenda}</legend>
      {children}
    </fieldset>
  )
}

/** Una opción grande: radio real + título + leyenda corta (+ dato a la derecha). */
function Opcion({
  nombre,
  checked,
  onElegir,
  titulo,
  leyenda,
  insignia,
  derecha,
}: {
  nombre: string
  checked: boolean
  onElegir: () => void
  titulo: string
  leyenda?: string
  insignia?: string
  derecha?: string
}) {
  return (
    <label className={tarjetaOpcion}>
      <input type="radio" name={nombre} checked={checked} onChange={onElegir} className="mt-1" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {titulo}
          {insignia && (
            <span className="ml-2 rounded-full border border-(--color-ok) px-2 py-0.5 text-xs font-normal">{insignia}</span>
          )}
        </span>
        {leyenda && <span className="block text-xs text-(--color-tenue)">{leyenda}</span>}
      </span>
      {derecha && <span className="text-xs whitespace-nowrap text-(--color-tenue) tabular-nums">{derecha}</span>}
    </label>
  )
}

/**
 * "Crear imagen": UN solo flujo guiado para las dos formas de partir (foto real
 * o texto aprobado). 1) de dónde partís, 2) qué querés, 3) precio y confirmación.
 *
 * La compuerta de costo es la de siempre (regla dura #3): "Ver precio" estima
 * (gratis, el servidor calcula), se MUESTRA el monto y recién el click en
 * "Confirmar US$ X" gasta. El cliente nunca manda un precio. Se usa <img> a
 * propósito (URLs firmadas de vida corta, igual que la galería).
 */
export function CrearImagen({
  piezas,
  fotos,
  piezaInicialId,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  opciones,
}: {
  piezas: readonly PiezaImagenVista[]
  fotos: readonly FotoVista[]
  piezaInicialId: string | null
  puedeEditar: boolean
  /** Por qué no se puede generar (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  /** Las opciones que arma el servidor (las mismas que en Promociones). */
  opciones: Opciones
}) {
  const router = useRouter()
  const piezaDePartida = piezas.find((p) => p.id === piezaInicialId)
  const [origen, setOrigen] = useState<Origen>(piezaDePartida ? 'texto' : 'foto')
  const [fotoId, setFotoId] = useState<string | null>(null)
  const [piezaId, setPiezaId] = useState(piezaDePartida?.id ?? piezas[0]?.id ?? '')
  const [fondo, setFondo] = useState('fondo_estudio')
  const [descripcion, setDescripcion] = useState('')
  const [inspiracion, setInspiracion] = useState<InspiracionVista | null>(null)
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [motor, setMotor] = useState(opciones.motorPorDefecto)
  const [cantidad, setCantidad] = useState(1)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const [avisoBorrado, setAvisoBorrado] = useState<string | null>(null)
  // Cualquier cambio de opciones descarta la estimación en pantalla (cambia la key de la compuerta).
  const [version, setVersion] = useState(0)
  const descartar = () => setVersion((v) => v + 1)

  // Si la foto elegida desapareció (se borró) o todavía no se eligió ninguna, vale la más reciente.
  const foto = fotos.find((x) => x.id === fotoId) ?? fotos[0] ?? null
  const pieza = piezas.find((p) => p.id === piezaId) ?? null
  const corriendo = false
  const falta = faltaPedidoDeFondo(fondo, descripcion, inspiracion !== null)
  const listo = origen === 'foto' ? foto !== null : pieza !== null

  function cambiar<T>(poner: (v: T) => void) {
    return (v: T) => {
      poner(v)
      descartar()
    }
  }

  async function borrar(id: string) {
    if (borrando) return
    setBorrando(true)
    setErrorBorrado(null)
    const r = await deleteFoto(id)
    setBorrando(false)
    setConfirmandoBorrado(false)
    if (!r.ok) {
      setErrorBorrado(r.error)
      return
    }
    setFotoId(null)
    descartar()
    if (r.pendiente) setAvisoBorrado('La foto quedó marcada como borrada, pero su archivo no se pudo eliminar todavía: queda pendiente.')
    router.refresh()
  }

  return (
    <section aria-labelledby="crear-imagen" className="space-y-6 rounded-lg border border-(--color-borde) px-4 py-5 sm:px-6">
      <h2 id="crear-imagen" className="text-lg font-semibold">
        Crear imagen
      </h2>
      <GastoDelMes topeUsd={topeUsd} gastadoUsd={gastadoUsd} />

      {!puedeEditar ? (
        <AvisoSoloVer />
      ) : (
        <>
          <Grupo leyenda="Paso 1 · ¿De dónde partís?" deshabilitado={corriendo}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcion
                nombre="origen"
                checked={origen === 'foto'}
                onElegir={() => cambiar(setOrigen)('foto')}
                titulo="Una foto real de tu moto"
                insignia="Recomendado"
                leyenda="La IA cambia el fondo o el formato y no toca la moto."
              />
              <Opcion
                nombre="origen"
                checked={origen === 'texto'}
                onElegir={() => cambiar(setOrigen)('texto')}
                titulo="Un texto ya aprobado"
                leyenda="La IA inventa la imagen desde cero. Puede dibujar la moto distinta."
              />
            </div>
          </Grupo>

          {origen === 'foto' ? (
            <div className="space-y-3">
              {fotos.length === 0 ? (
                <p className="text-sm text-(--color-tenue)">Todavía no subiste ninguna foto. Subí la primera para seguir.</p>
              ) : (
                <>
                  <Grupo leyenda="Elegí la foto" deshabilitado={corriendo}>
                    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                      {fotos.map((x) => (
                        <li key={x.id}>
                          <label className="block cursor-pointer overflow-hidden rounded-lg border border-(--color-borde) has-[:checked]:border-2 has-[:checked]:border-(--color-ok) has-[:focus-visible]:outline-2">
                            <input
                              type="radio"
                              name="foto"
                              className="sr-only"
                              aria-label={`Foto del ${fechaCorta(x.creadoEn)}`}
                              checked={foto?.id === x.id}
                              onChange={() => {
                                cambiar(setFotoId)(x.id)
                                setConfirmandoBorrado(false)
                              }}
                            />
                            {x.url ? (
                              <img src={x.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                            ) : (
                              <span className="block px-2 py-6 text-center text-xs text-(--color-tenue)">Sin vista previa</span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </Grupo>

                  {foto &&
                    (confirmandoBorrado ? (
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
                      <button
                        type="button"
                        className="text-xs text-(--color-tenue) underline hover:opacity-70"
                        onClick={() => setConfirmandoBorrado(true)}
                      >
                        Borrar esta foto
                      </button>
                    ))}
                  {errorBorrado && (
                    <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
                      {errorBorrado}
                    </p>
                  )}
                  {avisoBorrado && (
                    <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
                      {avisoBorrado}
                    </p>
                  )}
                </>
              )}

              <details open={fotos.length === 0 ? true : undefined} className="rounded-lg border border-(--color-borde) px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">Subir una foto nueva</summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-(--color-tenue)">
                    Subir es gratis: no se cobra nada hasta que generes una imagen. La foto original nunca se publica ni se comparte;
                    solo se manda a Gemini para editarla.
                  </p>
                  <SubirFoto puedeEditar alSubir={(f) => cambiar(setFotoId)(f.id)} />
                </div>
              </details>
            </div>
          ) : piezas.length === 0 ? (
            <p className="text-sm text-(--color-tenue)">
              Todavía no hay piezas aprobadas de formato imagen, carrusel o historia. Aprobá una en{' '}
              <Link href="/contenido" className="underline">
                Contenido
              </Link>{' '}
              y volvé acá.
            </p>
          ) : (
            <label className="block text-sm">
              Pieza aprobada
              <select
                className={campo}
                value={piezaId}
                disabled={corriendo}
                onChange={(e) => cambiar(setPiezaId)(e.target.value)}
              >
                {piezas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pieza.plataforma} {p.pieza.formato} · {p.pieza.hook.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {listo ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Paso 2 · ¿Qué querés?</h3>
              {origen === 'foto' ? (
                <p role="note" className="text-xs text-(--color-tenue)">
                  Revisá que la moto no haya cambiado: forma, color y logos.
                </p>
              ) : (
                pieza && (
                  <p className="text-sm text-(--color-tenue)">
                    Proporción {pieza.aspecto} · Brief visual: {pieza.pieza.briefVisual}
                  </p>
                )
              )}

              <OpcionesImagen
                opciones={opciones}
                conFondo={origen === 'foto'}
                fondo={fondo}
                onFondo={cambiar(setFondo)}
                descripcion={descripcion}
                onDescripcion={cambiar(setDescripcion)}
                inspiracion={inspiracion}
                onInspiracion={(f) => cambiar(setInspiracion)(f === null ? null : { id: f.id, url: f.url, borrada: false })}
                motor={motor}
                onMotor={cambiar(setMotor)}
                cantidad={cantidad}
                onCantidad={cambiar(setCantidad)}
                puede={puedeEditar}
                ocupado={false}
                extras={
                  origen === 'foto' ? (
                    <Grupo leyenda="Formato" deshabilitado={false}>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(Object.keys(ASPECTOS_FOTO) as AspectoFoto[]).map((a) => (
                          <Opcion key={a} nombre="formato" checked={aspecto === a} onElegir={() => cambiar(setAspecto)(a)} titulo={FORMATOS[a]} />
                        ))}
                      </div>
                    </Grupo>
                  ) : undefined
                }
              />
              <p className="text-xs text-(--color-tenue)">Las imágenes son de 1K. El video todavía no está disponible.</p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
            <h3 className="text-sm font-semibold">Paso 3 · Precio y confirmación</h3>
            <CompuertaImagen
              key={version}
              apagado={apagado}
              puedeEditar={puedeEditar}
              deshabilitado={!listo || (origen === 'foto' && falta)}
              topeUsd={topeUsd}
              gastadoUsd={gastadoUsd}
              seVaAPedir={origen === 'foto' && listo ? { fondo, descripcion: descripcion.trim() || null, conInspiracion: inspiracion !== null, posicionMoto: null } : null}
              despuesDeListo={<>Mirala abajo en &ldquo;Imágenes generadas&rdquo;.</>}
              pedir={() =>
                origen === 'foto' && foto
                  ? postEstimacionFoto({ fotoId: foto.id, edicion: fondo, aspecto, motor, cantidad, descripcion: descripcion.trim(), inspiracionFotoId: inspiracion?.id ?? null })
                  : postEstimacion({ piezaId: pieza?.id ?? '', motor, cantidad })
              }
            >
              {origen === 'foto' && falta && <p className="text-xs text-(--color-falta)">{MENSAJE_FALTA_DESCRIPCION}</p>}
            </CompuertaImagen>
          </div>
        </>
      )}
    </section>
  )
}
