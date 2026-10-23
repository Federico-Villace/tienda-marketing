'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatearUsd } from '@/lib/estratega/formato'
import { ASPECTOS_FOTO, type AspectoFoto, type IdEdicion, type ItemMenuFoto } from '@/lib/productor/ediciones'
import type { FotoVista, PiezaImagenVista } from '@/lib/productor/pantalla'
import { deleteFoto, postEstimacion, postEstimacionFoto } from './api'
import { usarCompuerta } from './compuerta-cliente'
import { SubirFoto } from './subir-foto'

export type MotorImagen = { id: string; nombre: string; porImagenUsd: number }

type Origen = 'foto' | 'texto'

const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
const botonPrincipal =
  'rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold hover:opacity-70 disabled:cursor-not-allowed disabled:border-(--color-borde) disabled:opacity-50'
const tarjetaOpcion =
  'flex cursor-pointer items-start gap-3 rounded-lg border border-(--color-borde) px-3 py-2.5 text-sm has-[:checked]:border-(--color-ok) has-[:focus-visible]:outline-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'

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

/** "rápido y barato" para el motor más barato; para el resto, cuántas veces cuesta de más. */
function leyendaMotor(m: MotorImagen, motores: readonly MotorImagen[]): string {
  const minimo = Math.min(...motores.map((x) => x.porImagenUsd))
  if (m.porImagenUsd <= minimo) return 'rápido y barato'
  return `más fiel, ~${Math.max(2, Math.round(m.porImagenUsd / minimo))}× el precio`
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
  motores,
  motorPorDefecto,
  menuPorMotor,
}: {
  piezas: readonly PiezaImagenVista[]
  fotos: readonly FotoVista[]
  piezaInicialId: string | null
  puedeEditar: boolean
  /** Por qué no se puede generar (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motores: readonly MotorImagen[]
  motorPorDefecto: string
  /** Menú con precio por imagen (tope, con la foto de entrada) para cada motor. */
  menuPorMotor: Readonly<Record<string, readonly ItemMenuFoto[]>>
}) {
  const router = useRouter()
  const piezaDePartida = piezas.find((p) => p.id === piezaInicialId)
  const [origen, setOrigen] = useState<Origen>(piezaDePartida ? 'texto' : 'foto')
  const [fotoId, setFotoId] = useState<string | null>(null)
  const [piezaId, setPiezaId] = useState(piezaDePartida?.id ?? piezas[0]?.id ?? '')
  const [edicion, setEdicion] = useState<IdEdicion>('fondo_estudio')
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [motor, setMotor] = useState(motorPorDefecto)
  const [cantidad, setCantidad] = useState(1)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const [avisoBorrado, setAvisoBorrado] = useState<string | null>(null)
  const { fase, estimacion, error, costoReal, pedirEstimacion, confirmar, descartar } = usarCompuerta(apagado)

  // Si la foto elegida desapareció (se borró) o todavía no se eligió ninguna, vale la más reciente.
  const foto = fotos.find((x) => x.id === fotoId) ?? fotos[0] ?? null
  const pieza = piezas.find((p) => p.id === piezaId) ?? null
  const menu = menuPorMotor[motor] ?? []
  const restante = topeUsd === null ? null : Math.max(0, topeUsd - gastadoUsd)
  const corriendo = fase === 'corriendo'
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

  const encabezado = (
    <div className="space-y-2">
      {topeUsd !== null && restante !== null ? (
        <>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-semibold">{`${formatearUsd(gastadoUsd)} de ${formatearUsd(topeUsd)} este mes`}</span>
            <span className="text-xs text-(--color-tenue)">quedan {formatearUsd(restante)}</span>
          </p>
          <div
            role="meter"
            aria-label="Gasto del mes"
            aria-valuemin={0}
            aria-valuemax={topeUsd}
            aria-valuenow={gastadoUsd}
            className="h-2 overflow-hidden rounded-full border border-(--color-borde)"
          >
            <div
              className="h-full bg-(--color-ok)"
              style={{ width: `${topeUsd > 0 ? Math.min(100, (gastadoUsd / topeUsd) * 100) : 0}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold">Gastado este mes: {formatearUsd(gastadoUsd)}</p>
      )}
      <p className="text-xs text-(--color-tenue)">Cada imagen cuesta plata real. Nada se cobra hasta que apretás Confirmar.</p>
    </div>
  )

  return (
    <section aria-labelledby="crear-imagen" className="space-y-6 rounded-lg border border-(--color-borde) px-4 py-5 sm:px-6">
      <h2 id="crear-imagen" className="text-lg font-semibold">
        Crear imagen
      </h2>
      {encabezado}

      {apagado && (
        <p role="status" className="rounded-lg border border-(--color-aviso) px-4 py-2.5 text-sm text-(--color-aviso)">
          {apagado}
        </p>
      )}

      {!puedeEditar ? (
        <p className="text-sm text-(--color-tenue)">
          Tu rol solo permite ver: no podés subir fotos ni generar imágenes. Abajo ves lo que ya se generó.
        </p>
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
                <>
                  <p role="note" className="text-xs text-(--color-tenue)">
                    Revisá que la moto no haya cambiado: forma, color y logos.
                  </p>
                  <Grupo leyenda="¿Qué querés hacer con la foto?" deshabilitado={corriendo}>
                    {menu.map((item) => (
                      <Opcion
                        key={item.edicion}
                        nombre="edicion"
                        checked={edicion === item.edicion}
                        onElegir={() => cambiar(setEdicion)(item.edicion)}
                        titulo={item.nombre}
                        leyenda={item.descripcion}
                        derecha={`hasta ${formatearUsd(item.porImagenUsd)} por imagen`}
                      />
                    ))}
                  </Grupo>
                  <Grupo leyenda="Formato" deshabilitado={corriendo}>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(Object.keys(ASPECTOS_FOTO) as AspectoFoto[]).map((a) => (
                        <Opcion
                          key={a}
                          nombre="formato"
                          checked={aspecto === a}
                          onElegir={() => cambiar(setAspecto)(a)}
                          titulo={FORMATOS[a]}
                        />
                      ))}
                    </div>
                  </Grupo>
                </>
              ) : (
                pieza && (
                  <p className="text-sm text-(--color-tenue)">
                    Proporción {pieza.aspecto} · Brief visual: {pieza.pieza.briefVisual}
                  </p>
                )
              )}

              <Grupo leyenda="Motor" deshabilitado={corriendo}>
                {motores.map((m) => (
                  <Opcion
                    key={m.id}
                    nombre="motor"
                    checked={motor === m.id}
                    onElegir={() => cambiar(setMotor)(m.id)}
                    titulo={`${m.nombre} · ${leyendaMotor(m, motores)}`}
                    derecha={`~${formatearUsd(m.porImagenUsd)} c/u`}
                  />
                ))}
              </Grupo>

              <label className="block max-w-48 text-sm">
                Variantes
                <select
                  className={campo}
                  value={cantidad}
                  disabled={corriendo}
                  onChange={(e) => cambiar(setCantidad)(Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-(--color-tenue)">Las imágenes son de 1K. El video todavía no está disponible.</p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
            <h3 className="text-sm font-semibold">Paso 3 · Precio y confirmación</h3>
            <p className="text-xs text-(--color-tenue)">Ver precio no cuesta nada: te muestra cuánto sale antes de gastar.</p>
            <button
              type="button"
              className={boton}
              disabled={apagado !== null || fase !== 'libre' || !listo}
              onClick={() => {
                if (origen === 'foto' && foto) void pedirEstimacion(() => postEstimacionFoto({ fotoId: foto.id, edicion, aspecto, motor, cantidad }))
                else if (origen === 'texto' && pieza) void pedirEstimacion(() => postEstimacion({ piezaId: pieza.id, motor, cantidad }))
              }}
            >
              Ver precio
            </button>

            {estimacion && (
              <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
                <p className="text-sm">
                  {estimacion.datos.cantidad} {estimacion.datos.cantidad === 1 ? 'imagen' : 'imágenes'} × ~
                  {formatearUsd(estimacion.datos.porImagenUsd)} (precio de lista {formatearUsd(estimacion.datos.listaUsd)}). El tope
                  incluye el pensamiento y la entrada del modelo; el costo real puede ser menor.
                </p>
                {estimacion.excede && (
                  <p className="text-sm text-(--color-falta)">
                    Esta generación supera lo que queda del tope mensual: no se puede confirmar. Probá con menos variantes o con un
                    motor más barato.
                  </p>
                )}
                <button
                  type="button"
                  className={botonPrincipal}
                  disabled={corriendo || estimacion.excede || estimacion.bloqueada}
                  onClick={() => void confirmar()}
                >
                  {corriendo ? 'Generando… hasta 2 min' : `Confirmar ${formatearUsd(estimacion.datos.costoEstimadoUsd)}`}
                </button>
                {!corriendo && (
                  <p className="text-xs text-(--color-tenue)">Recién acá se cobra. La estimación vence en 15 minutos.</p>
                )}
              </div>
            )}
            {costoReal !== null && (
              <p role="status" className="text-sm">
                Listo. Costo real: {formatearUsd(costoReal)}. Mirala abajo en &ldquo;Imágenes generadas&rdquo;.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
