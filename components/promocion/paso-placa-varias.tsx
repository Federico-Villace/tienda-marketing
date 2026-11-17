'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { postEstimacionPromocion } from '@/components/creativos/api'
import { CompuertaImagen, GastoDelMes } from '@/components/imagenes/compuerta-imagen'
import type { InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import { OpcionesImagen } from '@/components/imagenes/opciones-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { opcionesDeImagen, type OpcionesImagen as Opciones } from '@/lib/imagenes/opciones'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { estimarImagenes, type CantidadEntradas } from '@/lib/productor/precios'
import { versionesDeImagen, type CreativoVista, type GeneracionVista } from '@/lib/productor/pantalla'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import { limitesTexto } from '@/lib/promocion/plantillas'
import { textosParaPlaca } from '@/lib/promocion/textos-placa'
import type { PromocionVista } from '@/lib/promocion/tipos'
import { resolverDiseno } from '@/lib/promocion/diseno/defaults'
import type { Diseno } from '@/lib/promocion/diseno/tipos'
import { logoDibujable } from '@/lib/promocion/copia/logo'
import { textosCopiaFiel, textosVisibles } from '@/lib/promocion/copia/textos'
import { esCopiaFiel, MOTOR_COPIA_POR_DEFECTO } from '@/lib/promocion/copia/tipos'
import { textosDeGrilla } from '@/lib/promocion/varias/grilla'
import { esGrilla } from '@/lib/promocion/varias/tipos'
import { MostrarTextos } from './mostrar-textos'
import { MANIFIESTO_VACIO, useContextoDiseno } from './contexto-diseno'
import { patchPromocion, postPlaca, postReverificacion } from './api'
import { EstadoVerificacion } from './estado-verificacion'
import { TarjetaCopiaFiel } from './tarjeta-copia-fiel'
import { TextosCopiaFielVarias } from './textos-copia'
import type { FuentesPlaca } from './placa'
import { boton, botonPrincipal, campo, Estado, ListaErrores, tarjetaOpcion, TituloPaso, usarAccion } from './ui'
import { BarraAccion } from '@/components/ui/barra-accion'
import { EditorConVistaPrevia } from '@/components/ui/editor-con-vista-previa'
import { ImagenAmpliable } from '@/components/ui/lightbox'
import { VistaPlaca } from './vista-placa'

/** Cuántas variantes se piden por defecto con la copia fiel (se puede cambiar de 1 a 4). */
const VARIANTES = 2
/** Cuánto se espera sin teclear antes de guardar solo. Al salir del campo se guarda en el momento. */
const ESPERA_GUARDADO_MS = 800
const tieneEmoji = (t: string) => /\p{Extended_Pictographic}/u.test(t)

/**
 * Paso 4 de una placa de VARIAS MOTOS (ADR-041) · ¿Cómo querés que se vea? Dos caminos, y los dos terminan en la misma "Ver la versión final", el mismo
 * aprobar y el mismo descargar de siempre:
 *  - **Copia fiel de tu referencia**: la IA copia una placa que te gusta con TODAS tus motos y escribe cada modelo y cada precio junto a su moto; un revisor
 *    lee los textos y una imagen que difiere no se puede usar. Cuesta (imagen + revisión): "Ver precio" muestra el total y recién "Confirmar" gasta.
 *  - **Grilla de motos**: sin referencia, una grilla con las fotos reales de las motos, armada por nosotros: no usa IA, no cuesta nada y ninguna moto se toca.
 * Es el paso 4 de siempre para una placa con varias motos: un componente aparte porque el de una sola moto gira alrededor de UNA escena de fondo.
 */
export function PasoPlacaVarias({
  promocion: inicial,
  marca,
  motos,
  escenas,
  placaUrl,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motor: motorInicial,
  opciones: opcionesPropias,
  fuentes,
  inspiracion,
  inspiraciones = [],
  verificacionUsd = null,
  comprimirFoto,
  esperaGuardadoMs = ESPERA_GUARDADO_MS,
}: {
  promocion: PromocionVista
  marca: string
  /** TODAS las motos con su foto firmada, la principal primero. */
  motos: NonNullable<DetallePromocion['motos']>
  escenas: DetallePromocion['escenas']
  /** La placa final vigente (URL firmada), si hay. */
  placaUrl: string | null
  puedeEditar: boolean
  /** Por qué no se puede generar (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motor: string
  opciones?: Opciones
  fuentes: FuentesPlaca
  /** La foto de la referencia guardada (URL firmada), si hay. */
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  inspiraciones?: readonly InspiracionElegible[]
  /** Lo más que cuesta revisar los textos de UNA imagen (para decir cuánto sale generar otra). */
  verificacionUsd?: number | null
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Solo para probar el guardado automático sin esperar. */
  esperaGuardadoMs?: number
}) {
  const [promocion, setPromocion] = useState(inicial)
  // Si el servidor trae una revisión más nueva (después de un refresh), esa manda.
  if (inicial.revision > promocion.revision) setPromocion(inicial)
  const router = useRouter()
  const accion = usarAccion()
  const contexto = useContextoDiseno()
  const manifiesto = contexto.manifiesto ?? MANIFIESTO_VACIO

  // Cada PATCH sale con SU revisión: lo que escribe en la promoción va en fila.
  const ultima = useRef(promocion)
  useEffect(() => {
    if (promocion.revision > ultima.current.revision) ultima.current = promocion
  }, [promocion])
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  function enCola<T>(fn: () => Promise<T>): Promise<T> {
    const p = cola.current.then(fn)
    cola.current = p.catch(() => undefined)
    return p
  }

  const esCopia = esCopiaFiel(promocion.plantilla)
  const esLaGrilla = esGrilla(promocion.plantilla)
  const abierta = promocion.estado === 'borrador'
  const puede = puedeEditar && abierta

  const resueltoInicial = resolverDiseno(promocion.diseno, 'impactante_textura', { modelo: promocion.modelo, titular: promocion.titular ?? promocion.copy?.titular ?? '', datos: promocion.datos })
  const [titular, setTitular] = useState(promocion.titular ?? promocion.copy?.titular ?? '')
  const [lineaExtra, setLineaExtra] = useState(promocion.lineaExtra ?? '')
  const [frase, setFrase] = useState(resueltoInicial.frase)
  const valores = useRef({ titular, lineaExtra, frase })
  const tocados = useRef(new Set<'titular' | 'lineaExtra' | 'frase'>())
  const escribir = {
    titular: (x: string) => ((valores.current.titular = x), tocados.current.add('titular'), setTitular(x)),
    lineaExtra: (x: string) => ((valores.current.lineaExtra = x), tocados.current.add('lineaExtra'), setLineaExtra(x)),
    frase: (x: string) => ((valores.current.frase = x), tocados.current.add('frase'), setFrase(x)),
  }

  const [avisos, setAvisos] = useState<string[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [urlFinal, setUrlFinal] = useState(placaUrl)
  const [reutilizada, setReutilizada] = useState(false)
  const opciones = opcionesPropias ?? opcionesDeImagen('promocion', motorInicial)
  const [motorElegido, setMotor] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(VARIANTES)
  const cargando = ocupado || accion.cargando
  const motor = motorElegido ?? MOTOR_COPIA_POR_DEFECTO

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
    // Lo que se guardó cambia la placa: lo que el servidor dibuja en otros pasos (el resumen "Tu promoción") se vuelve a leer.
    router.refresh()
    return true
  }

  /** Lo escrito que todavía no está en la promoción guardada, listo para el PATCH. */
  function pendientes(): Record<string, unknown> {
    const p = ultima.current
    const v = valores.current
    const campos: Record<string, unknown> = {}
    if (tocados.current.has('titular')) {
      const t = v.titular.trim()
      if (t !== '' && t !== (p.titular ?? p.copy?.titular ?? '')) campos.titular = t
    }
    if (tocados.current.has('lineaExtra')) {
      const l = v.lineaExtra.trim() === '' ? null : v.lineaExtra.trim()
      if (!tieneEmoji(v.lineaExtra) && l !== (p.lineaExtra ?? null)) campos.lineaExtra = l
    }
    if (tocados.current.has('frase')) {
      const r = resolverDiseno(p.diseno, 'impactante_textura', { modelo: p.modelo, titular: p.titular ?? p.copy?.titular ?? '', datos: p.datos })
      const fr = v.frase.trim()
      if (fr !== r.frase) {
        const nuevo: Diseno = { ...(p.diseno ?? {}) }
        if (fr === '') delete nuevo.frase
        else nuevo.frase = fr
        campos.diseno = nuevo
      }
    }
    return campos
  }
  const hayPendiente = Object.keys(pendientes()).length > 0

  function guardarPendiente(): Promise<boolean> {
    return enCola(async () => {
      const campos = pendientes()
      if (Object.keys(campos).length === 0) return true
      setGuardando(true)
      const ok = await enviar(campos)
      setGuardando(false)
      if (!ok) return false
      tocados.current.clear()
      setGuardado(true)
      return true
    })
  }

  // Guardado automático: al dejar de escribir un rato.
  useEffect(() => {
    if (!puede) return
    const t = setTimeout(() => void guardarPendiente(), esperaGuardadoMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titular, lineaExtra, frase, puede, esperaGuardadoMs])

  /** Un click (el diseño, lo que se muestra, la referencia, una imagen): va en la misma fila que el guardado automático. */
  async function cambiar(campos: Record<string, unknown>) {
    setAvisos([])
    setOcupado(true)
    await enCola(() => enviar(campos))
    setOcupado(false)
  }
  async function cambiarDiseno(cambio: Diseno) {
    await cambiar({ diseno: { ...(ultima.current.diseno ?? {}), ...cambio } })
  }

  async function versionFinal() {
    if (!(await guardarPendiente())) return
    const r = await accion.correr(() => enCola(() => postPlaca(ultima.current.id, { revision: ultima.current.revision })))
    if (!r) return
    ultima.current = r.promocion
    setPromocion(r.promocion)
    setUrlFinal(r.url)
    setReutilizada(r.reutilizada)
    router.refresh()
  }

  // ── Lo que se escribe (vista previa en vivo, aun sin guardar) ──────────────────────────────────────────
  const ocultos = promocion.diseno?.ocultos ?? []
  const titularVivo = titular.trim() === '' ? promocion.titular : titular.trim()
  const textosGrilla = textosDeGrilla({
    marca,
    modelo: promocion.modelo,
    datos: promocion.datos,
    motosExtra: promocion.motosExtra,
    titular: titularVivo,
    titularDelTexto: promocion.copy?.titular ?? null,
    lineaExtra: lineaExtra.trim() === '' ? null : lineaExtra.trim(),
    ocultos,
  })
  const textosPlaca = textosParaPlaca({ marca, modelo: promocion.modelo, datos: promocion.datos, titular: titularVivo, titularDelTexto: promocion.copy?.titular ?? null, lineaExtra: null })
  const limites = limitesTexto('abajo')

  // La copia fiel: lo que se le pide escribir a la IA, tal como se va a pedir.
  const disenoVivo: Diseno = { ...(promocion.diseno ?? {}), ...(frase.trim() !== '' ? { frase: frase.trim() } : {}) }
  const resueltoCopia = resolverDiseno(disenoVivo, 'impactante_textura', { modelo: promocion.modelo, titular: promocion.titular ?? promocion.copy?.titular ?? '', datos: promocion.datos })
  const textosCopia = textosCopiaFiel(
    { modelo: promocion.modelo, titular: promocion.titular, copy: promocion.copy, datos: promocion.datos, diseno: disenoVivo, motos_extra: promocion.motosExtra },
    { negocio: marca, logoDibujable: logoDibujable(manifiesto, promocion.marcaId) },
  )
  const lineaCopia = textosVisibles(textosCopia).join(' · ')
  // La lista de motos muestra lo que sale del paso 1 (lo que la persona sacó se ve apagado).
  const motosParaLista = motos.map((m) => ({ modelo: m.modelo, precio: m.precio, condicion: m.condicion }))

  // ── La copia fiel: imágenes y revisión ────────────────────────────────────────────────────────────────
  const creativos = escenas.flatMap((e) => e.creativos)
  const generacionDe = (creativoId: string): GeneracionVista | null => escenas.find((e) => e.creativos.some((c) => c.id === creativoId))?.generacion ?? null
  /** Por qué una imagen NO se puede usar en la placa (null = se puede). Sin revisión OK, o de textos viejos, no sirve. */
  const bloqueoDeCopia = (c: CreativoVista, g: GeneracionVista): string | null => {
    if (!g.copiaFiel) return 'No es de la copia fiel: generá otra'
    if (g.textosVigentes === false) return 'Cambiaste los textos: generá otra'
    if (!c.verificacion || c.verificacion.estado === 'pendiente') return 'Sin revisar todavía: no se puede usar'
    return c.verificacion.estado === 'ok' ? null : 'Los textos no coinciden: no se puede usar'
  }
  const generacionElegida = promocion.escenaCreativoId ? generacionDe(promocion.escenaCreativoId) : null
  const creativoElegido = creativos.find((c) => c.id === promocion.escenaCreativoId) ?? null
  const textosVencidos = esCopia && generacionElegida !== null && generacionElegida.textosVigentes === false
  const copiaUsable = esCopia && creativoElegido !== null && generacionElegida !== null && bloqueoDeCopia(creativoElegido, generacionElegida) === null
  const escenaUrl = creativoElegido?.url ?? null
  const tieneReferencia = promocion.inspiracionFotoId !== null
  // Cuánto sale generar OTRA imagen: la imagen con una foto de entrada por moto más la referencia, y su revisión (el exacto lo da "Ver precio").
  const precioDeOtra = verificacionUsd
    ? formatearUsdCorto(estimarImagenes(motor, 1, { imagenesEntrada: (motos.length + 1) as CantidadEntradas }).topeTotalUsd + verificacionUsd, { estimado: true })
    : null

  const extraConEmoji = tieneEmoji(lineaExtra)
  const mostrarFinal = promocion.placaLista && urlFinal !== null && !hayPendiente
  const etiquetaGrilla = `Vista previa de la grilla: ${motos.map((m) => m.modelo).join(', ')}`

  if (!abierta) {
    return (
      <section>
        <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda="El diseño y la imagen de esta promoción." />
        <Estado>{promocion.estado === 'aprobada' ? 'Está aprobada: para cambiar algo tocá "Volver a editar" en el paso 5.' : 'Esta promoción está descartada.'}</Estado>
      </section>
    )
  }

  const controles = (
    <>
      <fieldset role="radiogroup" aria-label="Cómo armar la placa" disabled={!puede || cargando} className="min-w-0 space-y-2">
        <legend className="mb-1 text-sm font-medium">Cómo armar la placa</legend>
        <div className="grid gap-3">
          <TarjetaCopiaFiel
            key={promocion.inspiracionFotoId ?? 'sin-foto'}
            elegida={esCopia}
            puedeEditar={puedeEditar}
            bloqueado={!puede || cargando}
            foto={promocion.inspiracionFotoId !== null ? (inspiracion ?? { id: promocion.inspiracionFotoId, url: null, borrada: false }) : null}
            inspiraciones={inspiraciones}
            {...(comprimirFoto ? { comprimirFoto } : {})}
            alElegir={(f) => void cambiar({ plantilla: 'copia_fiel', inspiracionModo: 'diseno', ...(f ? { inspiracionFotoId: f.id } : {}) })}
          />
          <label className={`${tarjetaOpcion} flex-col`}>
            <span className="flex items-center gap-2">
              <input type="radio" name="plantilla-diseno" checked={esLaGrilla} disabled={!puede || cargando} onChange={() => void cambiar({ plantilla: 'varias_motos' })} />
              <span className="font-medium">Grilla de motos (sin costo)</span>
            </span>
            <span className="text-xs text-(--color-tenue)">Armada por nosotros con tus fotos: cada moto con su modelo y su precio. No usa IA, no cuesta nada y ninguna moto se toca.</span>
          </label>
        </div>
      </fieldset>

      {esLaGrilla && puedeEditar && (
        <>
          <MostrarTextos clasica ocultos={ocultos} onCambiar={(o) => void cambiarDiseno({ ocultos: o })} deshabilitado={!puede || cargando} />
          <div className="space-y-2">
            <label htmlFor="varias-titular" className="text-sm font-medium">
              Titular
            </label>
            <input id="varias-titular" className={campo} value={titular} maxLength={limites.titular} disabled={!puede} onChange={(e) => escribir.titular(e.target.value)} onBlur={() => void guardarPendiente()} />
            <p className="text-xs text-(--color-tenue) tabular-nums">{titular.length}/{limites.titular} · Sin montos: cada precio va junto a su moto.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="varias-extra" className="text-sm font-medium">
              Línea extra (opcional)
            </label>
            <input
              id="varias-extra"
              className={campo}
              value={lineaExtra}
              maxLength={limites.extra}
              disabled={!puede}
              placeholder="Ej.: Hot Sale · Solo este fin de semana"
              onChange={(e) => escribir.lineaExtra(e.target.value)}
              onBlur={() => void guardarPendiente()}
            />
            <p className="text-xs text-(--color-tenue) tabular-nums">{lineaExtra.length}/{limites.extra} · Va abajo. El único precio de cada moto es el que cargaste.</p>
            {extraConEmoji && <p className="text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
          </div>
          {(guardando || hayPendiente || guardado) && (
            <span aria-live="polite" className="text-xs text-(--color-tenue)">
              {guardando ? 'Guardando…' : hayPendiente ? 'Sin guardar…' : 'Guardado'}
            </span>
          )}
        </>
      )}

      {esCopia && puedeEditar && (
        <TextosCopiaFielVarias
          resuelto={resueltoCopia}
          motos={motosParaLista}
          lugar={promocion.datos.lugar}
          frase={frase}
          onEscribirFrase={escribir.frase}
          onBlur={() => void guardarPendiente()}
          indicador={
            guardando || hayPendiente || guardado ? (
              <span aria-live="polite" className="text-xs text-(--color-tenue)">
                {guardando ? 'Guardando…' : hayPendiente ? 'Sin guardar…' : 'Guardado'}
              </span>
            ) : null
          }
          onCambiar={(c) => void cambiarDiseno(c)}
          deshabilitado={!puede || cargando}
          lineaPedida={lineaCopia}
        />
      )}

      {esCopia && (
        <>
          <GastoDelMes topeUsd={topeUsd} gastadoUsd={gastadoUsd} />

          <OpcionesImagen
            opciones={opciones}
            fondo={null}
            onFondo={() => {}}
            descripcion=""
            onDescripcion={() => {}}
            inspiracion={promocion.inspiracionFotoId && inspiracion ? inspiracion : null}
            onInspiracion={(foto) => void cambiar({ inspiracionFotoId: foto?.id ?? null })}
            inspiraciones={inspiraciones}
            modoInspiracion={promocion.inspiracionModo}
            onModoInspiracion={(modo) => void cambiar({ inspiracionModo: modo })}
            {...(comprimirFoto ? { comprimirFoto } : {})}
            conFondo={false}
            calidadAbierta
            leyendaDeMotor={(m: { id: string }) => (m.id === MOTOR_COPIA_POR_DEFECTO ? 'Escribe mejor los textos' : 'Más barato, pero escribe peor: puede que tengas que generar otra')}
            motor={motor}
            onMotor={setMotor}
            cantidad={cantidad}
            onCantidad={setCantidad}
            puede={puede}
            ocupado={cargando}
          />

          <div id="generar-imagen" className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
            <h3 className="text-sm font-semibold">Generar la imagen</h3>
            <CompuertaImagen
              apagado={apagado}
              puedeEditar={puedeEditar}
              deshabilitado={!puede || !tieneReferencia || guardando}
              antes={guardarPendiente}
              seVaAPedir={null}
              topeUsd={topeUsd}
              gastadoUsd={gastadoUsd}
              explicacion={`Ver precio no cuesta nada: te muestra cuánto sale antes de gastar. La IA recibe ${motos.length} fotos (una por moto) y tu referencia; se generan ${cantidad} ${cantidad === 1 ? 'variante' : 'variantes'} y cada una se revisa sola (cada modelo y cada precio tienen que coincidir con lo que cargaste).`}
              textoCorriendo="Generando y revisando los textos… puede tardar hasta 3 minutos"
              desglose={(d: { cantidad: number; verificacionUsd?: number; costoEstimadoUsd: number }) =>
                `${d.cantidad} ${d.cantidad === 1 ? 'imagen' : 'imágenes'} + revisión de textos${d.verificacionUsd ? ` (${formatearUsdCorto(d.verificacionUsd, { estimado: true })} c/u)` : ''}. El tope incluye todo; el costo real puede ser menor.`
              }
              despuesDeListo="Elegí una imagen abajo."
              pedir={() => postEstimacionPromocion({ promocionId: ultima.current.id, motor, cantidad })}
            >
              {!tieneReferencia && <p className="text-xs text-(--color-tenue)">Primero elegí la foto de tu referencia.</p>}
            </CompuertaImagen>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Imagen</h3>
            <VersionesImagen
              versiones={versionesDeImagen(escenas.map((e) => e.generacion), creativos)}
              alt={(_c, i) => `Imagen generada ${i + 1}`}
              puedeEditar={puedeEditar}
              usar={{ modo: 'radio', elegidoId: promocion.escenaCreativoId, alElegir: (id) => void cambiar({ escenaCreativoId: id }), bloqueado: !puede || cargando, bloqueoDe: bloqueoDeCopia }}
              vacio="Todavía no generaste ninguna imagen para esta promoción."
              accionesDe={(c) =>
                c.url && c.verificacion ? (
                  <EstadoVerificacion
                    verificacion={c.verificacion}
                    puedeEditar={puede}
                    bloqueado={cargando}
                    reverificar={async (aceptado) => {
                      const r = await postReverificacion(c.id, aceptado)
                      if (r.ok) router.refresh()
                      return r
                    }}
                  />
                ) : null
              }
            />
            <p className="text-xs text-(--color-tenue)">En una placa de varias motos no se piden cambios a la IA: si algo no te gusta, generá otra imagen.</p>
          </div>
        </>
      )}
    </>
  )

  const previa = (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{mostrarFinal ? 'Imagen final' : 'Así queda'}</h3>
        {mostrarFinal ? (
          <figure className="mx-auto max-w-sm space-y-1">
            <ImagenAmpliable src={urlFinal} alt={`Imagen final de la placa con ${motos.length} motos`} className="border border-(--color-borde)" />
            <figcaption className="text-xs text-(--color-tenue)">{reutilizada ? 'Lista: la imagen final ya tenía estos cambios.' : 'Imagen final lista.'}</figcaption>
          </figure>
        ) : esLaGrilla ? (
          <div className="mx-auto max-w-sm space-y-2" data-testid="previa-grilla">
            <VistaPlaca
              escenaSrc=""
              textos={textosPlaca}
              plantilla="varias_motos"
              aspecto={promocion.aspecto}
              fuentes={fuentes}
              grilla={{ textos: textosGrilla, fotos: motos.map((m) => m.url), marcaId: promocion.marcaId, ocultos }}
              etiqueta={etiquetaGrilla}
            />
            <p className="text-xs text-(--color-tenue)">Es una vista previa aproximada: “Ver la versión final” arma la imagen real con tus fotos.</p>
          </div>
        ) : esCopia ? (
          <div className="mx-auto max-w-sm space-y-2" data-testid="previa-copia-fiel">
            {escenaUrl === null ? (
              <p className="text-sm text-(--color-tenue)">Generá la imagen para verla.</p>
            ) : (
              <>
                <ImagenAmpliable src={escenaUrl} alt="Imagen de la copia fiel con varias motos" className="border border-(--color-borde)" />
                <p className="text-xs text-(--color-tenue)">La IA escribió los textos en la imagen: mirá que cada precio esté junto a su moto. “Ver la versión final” le pega el logo de tu concesionaria (gratis).</p>
                {textosVencidos && (
                  <p role="alert" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm">
                    Cambiaste los textos: la imagen tiene los anteriores. Generá otra{precioDeOtra ? ` (${precioDeOtra})` : ''}.
                  </p>
                )}
                {!textosVencidos && creativoElegido !== null && !copiaUsable && <p className="text-xs text-(--color-falta)">Esta imagen no se puede usar hasta que sus textos estén revisados y coincidan: elegí otra o generá de nuevo.</p>}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-(--color-tenue)">Elegí cómo armar la placa para ver cómo queda.</p>
        )}
        {cargando && <p role="status" className="text-sm text-(--color-tenue)">Trabajando…</p>}
      </div>

      {avisos.length > 0 && <Estado>{avisos.join(' ')}</Estado>}
      <ListaErrores errores={[...errores, ...accion.errores]} conflicto={conflicto || accion.conflicto} alRecargar={accion.recargar} />

      {(puedeEditar || promocion.placaLista) && (
        <BarraAccion>
          {puedeEditar && (
            <button
              type="button"
              className={promocion.placaLista ? boton : botonPrincipal}
              disabled={!puede || cargando || extraConEmoji || promocion.plantilla === null || (esCopia && !copiaUsable)}
              onClick={() => void versionFinal()}
            >
              Ver la versión final
            </button>
          )}
          {promocion.placaLista && (
            <Link href={`/promocionar/${promocion.id}?paso=5`} className={botonPrincipal}>
              Seguir a aprobar
            </Link>
          )}
        </BarraAccion>
      )}
    </>
  )

  return (
    <section>
      <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda={`Una sola imagen con tus ${motos.length} motos: elegí cómo armarla y revisá cómo queda.`} />
      <EditorConVistaPrevia controles={controles} previa={previa} />
    </section>
  )
}
