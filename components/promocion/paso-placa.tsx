'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { postEstimacionPromocion } from '@/components/creativos/api'
import { CompuertaImagen, GastoDelMes } from '@/components/imagenes/compuerta-imagen'
import { OpcionesImagen } from '@/components/imagenes/opciones-imagen'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { opcionesDeImagen, type OpcionesImagen as Opciones } from '@/lib/imagenes/opciones'
import { versionesDeImagen } from '@/lib/productor/pantalla'
import { fondoAlDescribir, INFO_FONDO, type EscenaResumen } from '@/lib/promocion/fondos'
import { faltaPedidoDeFondo, MENSAJE_FALTA_DESCRIPCION } from '@/lib/promocion/escena'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import { ESTILOS, limitesTexto, POSICIONES, PLANTILLAS } from '@/lib/promocion/plantillas'
import { textosParaPlaca } from '@/lib/promocion/textos-placa'
import { ESTILOS_PLACA, esFondo, esPlantilla, estiloDe, FONDO_SOLO_DESCRIPCION, plantillaDe, POSICIONES_MOTO, POSICIONES_TEXTO, posicionTextoDe, type EstiloPlaca, type PosicionMoto, type PosicionTexto, type PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postPlaca } from './api'
import type { FuentesPlaca } from './placa'
import { boton, botonPrincipal, campo, Estado, ListaErrores, tarjetaOpcion, TituloPaso, usarAccion } from './ui'
import type { Fallo } from './api'
import { VistaPlaca } from './vista-placa'

/** Cuántas variantes se piden por defecto en una promoción (se puede cambiar de 1 a 4). */
const VARIANTES = 2
/** Cuánto se espera sin teclear antes de guardar solo. Al salir del campo se guarda en el momento. */
const ESPERA_GUARDADO_MS = 800
const tieneEmoji = (t: string) => /\p{Extended_Pictographic}/u.test(t)
const AVISO_FONDO_DESCRIPCION = 'Como escribiste una descripción, el fondo pasó a "Usar solo mi descripción". Si querés el estudio igual, elegilo de nuevo.'

type Campo = 'descripcion' | 'titular' | 'lineaExtra'
type Valores = Record<Campo, string>

/**
 * Lo escrito que todavía no está en la promoción guardada, listo para el PATCH. Un titular
 * vacío o una línea con emojis no se guardan (no valen). La primera descripción con el fondo
 * por defecto pasa el fondo a "solo mi descripción" en el mismo guardado.
 */
function pendientes(v: Valores, p: PromocionVista): { campos: Record<string, unknown>; cuales: Campo[] } {
  const campos: Record<string, unknown> = {}
  const cuales: Campo[] = []
  const d = v.descripcion.trim() === '' ? null : v.descripcion.trim()
  if (d !== (p.fondoDescripcion ?? null)) {
    campos.fondoDescripcion = d
    cuales.push('descripcion')
    const nuevo = fondoAlDescribir(p.fondo, p.fondoDescripcion, v.descripcion)
    if (nuevo) campos.fondo = nuevo
  }
  const t = v.titular.trim()
  if (t !== '' && t !== (p.titular ?? p.copy?.titular ?? '')) {
    campos.titular = t
    cuales.push('titular')
  }
  const l = v.lineaExtra.trim() === '' ? null : v.lineaExtra.trim()
  if (!tieneEmoji(v.lineaExtra) && l !== (p.lineaExtra ?? null)) {
    campos.lineaExtra = l
    cuales.push('lineaExtra')
  }
  return { campos, cuales }
}

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
  motor: motorInicial,
  opciones: opcionesPropias,
  hermanas = [],
  fuentes,
  inspiracion,
  comprimirFoto,
  esperaGuardadoMs = ESPERA_GUARDADO_MS,
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
  /** Las opciones que arma el servidor (las mismas que en /creativos). Sin ellas se arman acá con el motor. */
  opciones?: Opciones
  /** Si es hija de una tanda: las otras placas en borrador de su misma moto (para "Usar también…"). */
  hermanas?: { id: string; revision: number }[]
  fuentes: FuentesPlaca
  /** La foto de inspiración guardada (URL firmada), si hay. */
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  /** Solo para probar la subida sin un navegador real. */
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Solo para probar el guardado automático sin esperar. */
  esperaGuardadoMs?: number
}) {
  const [promocion, setPromocion] = useState(inicial)
  // Si el servidor trae una revisión más nueva (después de un refresh), esa manda.
  if (inicial.revision > promocion.revision) setPromocion(inicial)

  // La última promoción guardada: cada PATCH sale con SU revisión (los guardados van en fila).
  const ultima = useRef(promocion)
  useEffect(() => {
    if (promocion.revision > ultima.current.revision) ultima.current = promocion
  }, [promocion])

  const [titular, setTitular] = useState(promocion.titular ?? promocion.copy?.titular ?? '')
  const [descripcion, setDescripcion] = useState(promocion.fondoDescripcion ?? '')
  const [lineaExtra, setLineaExtra] = useState(promocion.lineaExtra ?? '')
  // Lo escrito, al instante (los setters de arriba recién se ven en el próximo render).
  const valores = useRef<Valores>({ titular, descripcion, lineaExtra })
  const escribir: Record<Campo, (x: string) => void> = {
    descripcion: (x) => ((valores.current.descripcion = x), setDescripcion(x)),
    titular: (x) => ((valores.current.titular = x), setTitular(x)),
    lineaExtra: (x) => ((valores.current.lineaExtra = x), setLineaExtra(x)),
  }
  const [avisos, setAvisos] = useState<string[]>([])
  const [urlFinal, setUrlFinal] = useState(placaUrl)
  const [reutilizada, setReutilizada] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardados, setGuardados] = useState<ReadonlySet<Campo>>(new Set())
  const opciones = opcionesPropias ?? opcionesDeImagen('promocion', motorInicial)
  const [motor, setMotor] = useState(opciones.motorPorDefecto)
  const [cantidad, setCantidad] = useState(VARIANTES)
  // La imagen nueva de un cambio pedido (y de cuál se pidió): si es de la tanda se puede usar en las otras placas.
  const [nueva, setNueva] = useState<{ desde: string; id: string; hecho: number | null } | null>(null)
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  const accion = usarAccion()

  // La pieza de una tanda NO vuelve a pedir la imagen: la escena (fondo, descripción, inspiración) se arma y se paga en la tanda.
  const deTanda = promocion.tandaId !== null
  const abierta = promocion.estado === 'borrador'
  const puede = puedeEditar && abierta
  const cargando = ocupado || accion.cargando

  /** Todo lo que escribe en la promoción va en fila: nunca dos PATCH con la misma revisión. */
  function enCola<T>(fn: () => Promise<T>): Promise<T> {
    const p = cola.current.then(fn)
    cola.current = p.catch(() => undefined)
    return p
  }

  async function enviar(campos: Record<string, unknown>): Promise<boolean> {
    const r = await patchPromocion(ultima.current.id, { revision: ultima.current.revision, ...campos })
    if (!r.ok) {
      setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
      setConflicto(r.status === 409)
      return false
    }
    ultima.current = r.promocion
    setPromocion(r.promocion)
    setAvisos(r.avisos)
    setErrores([])
    setConflicto(false)
    return true
  }

  /** Guarda lo escrito que falte. Devuelve false si no se pudo (el error queda a la vista). */
  function guardarPendiente(): Promise<boolean> {
    return enCola(async () => {
      const { campos, cuales } = pendientes(valores.current, ultima.current)
      if (cuales.length === 0) return true
      const enviados = { ...valores.current }
      setGuardando(true)
      const ok = await enviar(campos)
      setGuardando(false)
      if (!ok) return false
      // Lo que el servidor normalizó vuelve al campo, salvo que la persona haya seguido escribiendo.
      const p = ultima.current
      const guardado: Valores = { descripcion: p.fondoDescripcion ?? '', titular: p.titular ?? p.copy?.titular ?? '', lineaExtra: p.lineaExtra ?? '' }
      for (const c of cuales) if (valores.current[c] === enviados[c]) escribir[c](guardado[c])
      setGuardados((g) => new Set([...g, ...cuales]))
      if (campos.fondo === FONDO_SOLO_DESCRIPCION) setAvisos((a) => [...a, AVISO_FONDO_DESCRIPCION])
      return true
    })
  }

  // Guardado automático: al dejar de escribir un rato.
  useEffect(() => {
    if (!puede) return
    const t = setTimeout(() => void guardarPendiente(), esperaGuardadoMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descripcion, titular, lineaExtra, puede, esperaGuardadoMs])
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
  const faltaFondo = esFondo(promocion.fondo) && faltaPedidoDeFondo(promocion.fondo, descripcion, promocion.inspiracionFotoId !== null)
  const listoParaEstimar = promocion.plantilla !== null && promocion.fondo !== null
  const pendiente = pendientes({ descripcion, titular, lineaExtra }, promocion).cuales
  const aPedir: EscenaResumen | null = listoParaEstimar
    ? { fondo: promocion.fondo!, descripcion: descripcion.trim() || null, conInspiracion: promocion.inspiracionFotoId !== null, posicionMoto: promocion.posicionMoto }
    : null

  /** Un click (diseño, fondo, moto, imagen, inspiración): va en la misma fila que el guardado automático. */
  async function cambiar(campos: Record<string, unknown>) {
    setAvisos([])
    setOcupado(true)
    await enCola(() => enviar(campos))
    setOcupado(false)
  }

  /** Estado del guardado de un campo, para que se vea que no hace falta otro botón. */
  function estadoCampo(c: Campo): string | null {
    if (pendiente.includes(c)) return guardando ? 'Guardando…' : 'Sin guardar…'
    return guardados.has(c) ? 'Guardado' : null
  }
  const indicador = (c: Campo) => {
    const e = estadoCampo(c)
    return e ? (
      <span aria-live="polite" className="text-xs text-(--color-tenue)">
        {e}
      </span>
    ) : null
  }

  const limites = limitesTexto(esPlantilla(promocion.plantilla) ? posicionTextoDe(promocion.plantilla) : 'abajo')
  const extraConEmoji = tieneEmoji(lineaExtra)
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

  /** Un cambio terminó: la imagen nueva pasa a ser la de ESTA promoción (gratis, es un PATCH). */
  async function usarLaNueva(desde: string, r: { creativos: { id: string | null; url: string | null }[] }) {
    const id = r.creativos.find((c) => c.id && c.url)?.id
    if (!id) return
    setNueva({ desde, id, hecho: null })
    await cambiar({ escenaCreativoId: id })
  }

  /** La misma imagen en las otras placas de la tanda: un PATCH por placa, cada uno con su revisión. */
  async function usarEnHermanas() {
    if (!nueva) return
    setOcupado(true)
    let hechas = 0
    for (const h of hermanas) {
      const r = await patchPromocion(h.id, { revision: h.revision, escenaCreativoId: nueva.id })
      if (!r.ok) {
        setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
        setConflicto(r.status === 409)
        break
      }
      hechas++
    }
    setOcupado(false)
    setNueva({ ...nueva, hecho: hechas })
  }

  async function versionFinal() {
    if (!(await guardarPendiente())) return
    const r = await accion.correr(() => enCola(() => postPlaca(ultima.current.id, { revision: ultima.current.revision })))
    if (!r) return
    ultima.current = r.promocion
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
        <fieldset role="radiogroup" aria-label="Estilo" disabled={!puede || cargando} className="min-w-0 space-y-2">
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

        <fieldset role="radiogroup" aria-label="Dónde va el texto" disabled={!puede || cargando} className="min-w-0 space-y-2">
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
          <p className="text-xs text-(--color-tenue)">
            {deTanda ? 'La imagen de la tanda se generó dejando libre un sector: si lo cambiás acá, conviene generar otra en la tanda.' : 'La imagen se genera dejando libre ese sector: si lo cambiás después, conviene generar otra.'}
          </p>
        </fieldset>

        <fieldset role="radiogroup" aria-label="Dónde va la moto" disabled={!puede || cargando} className="min-w-0 space-y-2">
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

        {deTanda ? (
          <ImagenDeLaTanda promocion={promocion} descripcion={descripcion} inspiracion={promocion.inspiracionFotoId && inspiracion ? inspiracion : null} tandaId={promocion.tandaId!} />
        ) : (
          <>
          <GastoDelMes topeUsd={topeUsd} gastadoUsd={gastadoUsd} />

          <OpcionesImagen
            opciones={opciones}
            fondo={promocion.fondo}
            onFondo={(id) => void cambiar({ fondo: id })}
            descripcion={descripcion}
            onDescripcion={escribir.descripcion}
            onDescripcionBlur={() => void guardarPendiente()}
            indicadorDescripcion={indicador('descripcion')}
            inspiracion={promocion.inspiracionFotoId && inspiracion ? inspiracion : null}
            onInspiracion={(foto) => void cambiar({ inspiracionFotoId: foto?.id ?? null })}
            {...(comprimirFoto ? { comprimirFoto } : {})}
            motor={motor}
            onMotor={setMotor}
            cantidad={cantidad}
            onCantidad={setCantidad}
            puede={puede}
            ocupado={cargando}
          />

          <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
            <h3 className="text-sm font-semibold">Generar la imagen</h3>
            <CompuertaImagen
              apagado={apagado}
              puedeEditar={puedeEditar}
              deshabilitado={!puede || !listoParaEstimar || faltaFondo || guardando}
              antes={guardarPendiente}
              seVaAPedir={aPedir}
              topeUsd={topeUsd}
              gastadoUsd={gastadoUsd}
              explicacion={`Ver precio no cuesta nada: te muestra cuánto sale antes de gastar. Se generan ${cantidad} ${cantidad === 1 ? 'variante' : 'variantes'} para que elijas.`}
              despuesDeListo="Elegí una imagen abajo."
              pedir={() => postEstimacionPromocion({ promocionId: ultima.current.id, motor, cantidad })}
            >
              {!listoParaEstimar && <p className="text-xs text-(--color-tenue)">Primero elegí el diseño y el fondo.</p>}
              {faltaFondo && <p className="text-xs text-(--color-falta)">{MENSAJE_FALTA_DESCRIPCION}</p>}
            </CompuertaImagen>
          </div>
          </>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Imagen</h3>
          <VersionesImagen
            versiones={versionesDeImagen(escenas.map((e) => e.generacion), creativos)}
            alt={(_c, i) => `Imagen generada ${i + 1}`}
            puedeEditar={puedeEditar}
            usar={{ modo: 'radio', elegidoId: promocion.escenaCreativoId, alElegir: (id) => void cambiar({ escenaCreativoId: id }), bloqueado: !puede || cargando }}
            vacio={deTanda ? 'La tanda todavía no generó ninguna imagen para esta moto.' : 'Todavía no generaste ninguna imagen para esta promoción.'}
            accionesDe={(c, v) =>
              c.url ? (
                <PedirCambioImagen
                  creativoId={c.id}
                  promocionId={promocion.id}
                  puedeEditar={puede}
                  apagado={apagado}
                  topeUsd={topeUsd}
                  gastadoUsd={gastadoUsd}
                  alTerminar={(r) => void usarLaNueva(c.id, r)}
                  debajo={
                    nueva?.desde === c.id && v.generacion.deTanda && hermanas.length > 0 ? (
                      nueva.hecho === null ? (
                        <button type="button" className={boton} disabled={cargando} onClick={() => void usarEnHermanas()}>
                          Usar también en las otras {hermanas.length} {hermanas.length === 1 ? 'placa' : 'placas'}
                        </button>
                      ) : (
                        <p role="status" className="text-xs">Imagen puesta en {nueva.hecho} {nueva.hecho === 1 ? 'placa más' : 'placas más'}.</p>
                      )
                    ) : null
                  }
                />
              ) : null
            }
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="promo-titular" className="text-sm font-medium">
            Titular
          </label>
          <input id="promo-titular" className={campo} value={titular} maxLength={limites.titular} disabled={!puede} onChange={(e) => escribir.titular(e.target.value)} onBlur={() => void guardarPendiente()} />
          <p className="text-xs text-(--color-tenue) tabular-nums">{titular.length}/{limites.titular} · Sin precios ni números: el precio va aparte.</p>
          {indicador('titular')}
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
            onChange={(e) => escribir.lineaExtra(e.target.value)}
            onBlur={() => void guardarPendiente()}
          />
          <p className="text-xs text-(--color-tenue) tabular-nums">
            {lineaExtra.length}/{limites.extra} · Va debajo del titular. El único precio es el que cargaste.
          </p>
          {extraConEmoji && <p className="text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
          {indicador('lineaExtra')}
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
            <button type="button" className={boton} disabled={!puede || cargando || extraConEmoji || !promocion.escenaCreativoId || !promocion.plantilla} onClick={() => void versionFinal()}>
              Ver la versión final
            </button>
          )}
          {cargando && <p role="status" className="text-sm text-(--color-tenue)">Trabajando…</p>}
          {promocion.placaLista && urlFinal && (
            <figure className="mx-auto max-w-sm space-y-1">
              <img src={urlFinal} alt={`Imagen final de ${promocion.modelo}`} className="w-full rounded-md border border-(--color-borde)" />
              <figcaption className="text-xs text-(--color-tenue)">{reutilizada ? 'Ya estaba armada: no cambió nada.' : 'Imagen final lista.'}</figcaption>
            </figure>
          )}
        </div>

        {avisos.length > 0 && <Estado>{avisos.join(' ')}</Estado>}
        <ListaErrores errores={[...errores, ...accion.errores]} conflicto={conflicto || accion.conflicto} alRecargar={accion.recargar} />

        {promocion.placaLista && (
          <Link href={`/promocionar/${promocion.id}?paso=5`} className={`${botonPrincipal} inline-block`}>
            Seguir a aprobar
          </Link>
        )}
      </div>
    </section>
  )
}

/** Con qué se generó la imagen de la tanda, solo para leer: cambiarlo o generar otra se hace en la tanda. */
function ImagenDeLaTanda({
  promocion,
  descripcion,
  inspiracion,
  tandaId,
}: {
  promocion: PromocionVista
  descripcion: string
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  tandaId: string
}) {
  const fondo = esFondo(promocion.fondo) ? INFO_FONDO[promocion.fondo].nombre : 'sin elegir'
  const d = descripcion.trim()
  return (
    <div className="space-y-2 rounded-lg border border-(--color-borde) px-4 py-3" data-testid="imagen-de-la-tanda">
      <h3 className="text-sm font-semibold">Imagen de la tanda</h3>
      <p className="text-sm">
        Fondo: {fondo}
        {d !== '' && <> · descripción: «{d}»</>}
        {' · '}moto: {promocion.posicionMoto ?? 'centro'}
      </p>
      {inspiracion && (
        <div className="flex items-center gap-2 text-sm">
          <span>Inspiración:</span>
          {inspiracion.url && !inspiracion.borrada ? <img src={inspiracion.url} alt="Foto de inspiración" className="h-14 w-14 rounded-md border border-(--color-borde) object-cover" /> : <span className="text-(--color-tenue)">(la foto se borró)</span>}
        </div>
      )}
      <Link href={`/promocionar/tanda/${tandaId}`} className="inline-block text-sm underline underline-offset-2">
        Cambiar el fondo o generar otra en la tanda →
      </Link>
    </div>
  )
}
