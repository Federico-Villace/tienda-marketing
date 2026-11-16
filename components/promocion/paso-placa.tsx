'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { postEstimacionPromocion } from '@/components/creativos/api'
import type { CreativoVista, GeneracionVista } from '@/lib/productor/pantalla'
import { CompuertaImagen, GastoDelMes } from '@/components/imagenes/compuerta-imagen'
import type { InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import { OpcionesImagen } from '@/components/imagenes/opciones-imagen'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { opcionesDeImagen, type OpcionesImagen as Opciones } from '@/lib/imagenes/opciones'
import { versionesDeImagen } from '@/lib/productor/pantalla'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { avisoDeFondo, fondoAlDescribir, fondoDeLaEscena, INFO_FONDO, type EscenaResumen } from '@/lib/promocion/fondos'
import { faltaPedidoDeFondo, MENSAJE_FALTA_DESCRIPCION } from '@/lib/promocion/escena'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import { ESTILOS, limitesTexto, POSICIONES, PLANTILLAS } from '@/lib/promocion/plantillas'
import { ocultosDeClasica, textosParaPlaca } from '@/lib/promocion/textos-placa'
import { ESTILOS_PLACA, esFondo, esPlantilla, esPlantillaClasica, estiloDe, FONDO_SOLO_DESCRIPCION, plantillaDe, POSICIONES_MOTO, POSICIONES_TEXTO, posicionDeClave, posicionTextoDe, type EstiloPlaca, type PosicionMoto, type PosicionTexto, type PromocionVista } from '@/lib/promocion/tipos'
import { resolverDiseno } from '@/lib/promocion/diseno/defaults'
import { PLANTILLAS_DISENO } from '@/lib/promocion/diseno/catalogo'
import type { Diseno } from '@/lib/promocion/diseno/tipos'
import { avisosLogo, logosDeMarca } from '@/lib/promocion/logos'
import { logoDibujable } from '@/lib/promocion/copia/logo'
import { textosCopiaFiel, textosVisibles } from '@/lib/promocion/copia/textos'
import { esCopiaFiel, MOTOR_COPIA_POR_DEFECTO } from '@/lib/promocion/copia/tipos'
import type { FilaPromocion } from '@/lib/promocion/tipos'
import { tonoDeReferencia } from '@/lib/promocion/referencia/acento'
import type { LecturaVista } from '@/lib/promocion/referencia/lectura'
import { IDS_PLANTILLA_DISENO, esPlantillaDiseno } from '@/lib/promocion/tipos'
import { MostrarTextos } from './mostrar-textos'
import { AjustesDiseno, type CampoDiseno } from './ajustes-diseno'
import { MANIFIESTO_VACIO, useContextoDiseno } from './contexto-diseno'
import { patchPromocion, postPlaca, postReverificacion } from './api'
import { EstadoVerificacion } from './estado-verificacion'
import { ID_TARJETA_COPIA, TarjetaCopiaFiel } from './tarjeta-copia-fiel'
import { TextosCopiaFiel } from './textos-copia'
import type { FuentesPlaca } from './placa'
import { boton, botonPrincipal, campo, Estado, ListaErrores, tarjetaOpcion, TituloPaso, usarAccion } from './ui'
import type { Fallo } from './api'
import { BarraAccion } from '@/components/ui/barra-accion'
import { EditorConVistaPrevia } from '@/components/ui/editor-con-vista-previa'
import { ImagenAmpliable, Lightbox } from '@/components/ui/lightbox'
import { VistaPlaca } from './vista-placa'

/** Cuántas variantes se piden por defecto en una promoción (se puede cambiar de 1 a 4). */
const VARIANTES = 2
/** Cuánto se espera sin teclear antes de guardar solo. Al salir del campo se guarda en el momento. */
const ESPERA_GUARDADO_MS = 800
const tieneEmoji = (t: string) => /\p{Extended_Pictographic}/u.test(t)
const AVISO_FONDO_DESCRIPCION = 'Como escribiste una descripción, el fondo pasó a "Usar solo mi descripción". Si querés el estudio igual, elegilo de nuevo.'

type Campo = 'descripcion' | 'titular' | 'lineaExtra' | CampoDiseno
type Valores = Record<Campo, string>

/**
 * Lo escrito que todavía no está en la promoción guardada, listo para el PATCH. Un titular
 * vacío o una línea con emojis no se guardan (no valen). La primera descripción con el fondo
 * por defecto pasa el fondo a "solo mi descripción" en el mismo guardado.
 */
function pendientes(v: Valores, p: PromocionVista, tocados: ReadonlySet<Campo> = new Set()): { campos: Record<string, unknown>; cuales: Campo[] } {
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
  // Plantillas de diseño: frase y condición viven en `diseno`; se guarda el objeto entero con lo que cambió.
  const r = resolverDeLaPromo(p)
  if (r) {
    const nuevo: Diseno = { ...(p.diseno ?? {}) }
    const fr = v.frase.trim()
    // Solo lo que la persona tocó: un campo que todavía no se leyó de lo guardado no se toma por "borrado".
    if (tocados.has('frase') && fr !== r.frase) {
      if (fr === '') delete nuevo.frase
      else nuevo.frase = fr
      cuales.push('frase')
    }
    const tx = v.condicionTexto.trim()
    const de = v.condicionDestacado.trim()
    if ((tocados.has('condicionTexto') || tocados.has('condicionDestacado')) && (tx !== r.condicion.texto || de !== r.condicion.destacado)) {
      nuevo.condicion = { texto: tx, destacado: de }
      cuales.push('condicionTexto')
    }
    if (cuales.includes('frase') || cuales.includes('condicionTexto')) campos.diseno = nuevo
  }
  return { campos, cuales }
}

const NOMBRE_MOTO: Record<PosicionMoto, string> = { izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha' }

/** El diseño completo (frase, condición, botón, ocultos…) de una promoción de diseño o de copia fiel (la copia usa lo mismo que escribe la IA: sale de la misma resolución). */
const resolverDeLaPromo = (p: Pick<PromocionVista, 'plantilla' | 'diseno' | 'modelo' | 'titular' | 'copy' | 'datos'>) =>
  esPlantillaDiseno(p.plantilla) || esCopiaFiel(p.plantilla)
    ? resolverDiseno(p.diseno, esCopiaFiel(p.plantilla) ? 'impactante_textura' : (p.plantilla as Parameters<typeof resolverDiseno>[1]), { modelo: p.modelo, titular: p.titular ?? p.copy?.titular ?? '', datos: p.datos })
    : null

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
  inspiraciones = [],
  verificacionUsd = null,
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
  /** Las de inspiración ya subidas, para reusar una. */
  inspiraciones?: readonly InspiracionElegible[]
  /** Copia fiel (ADR-040): lo más que cuesta revisar los textos de UNA imagen (para decir cuánto sale generar otra). */
  verificacionUsd?: number | null
  /** Solo para probar la subida sin un navegador real. */
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Solo para probar el guardado automático sin esperar. */
  esperaGuardadoMs?: number
}) {
  const [promocion, setPromocion] = useState(inicial)
  // Si el servidor trae una revisión más nueva (después de un refresh), esa manda.
  if (inicial.revision > promocion.revision) setPromocion(inicial)

  // La lectura de la referencia (ADR-039): ya no se ofrece leer (ADR-040), pero una promoción que ya usa "Como tu referencia" sigue andando con la suya.
  const lecturaActual: LecturaVista | null = promocion.referenciaDisenoId === null ? null : inicial.referencia?.id === promocion.referenciaDisenoId ? inicial.referencia : null
  const plantillaLeida = lecturaActual?.estado === 'lista' ? lecturaActual.plantilla : null

  // La última promoción guardada: cada PATCH sale con SU revisión (los guardados van en fila).
  const ultima = useRef(promocion)
  useEffect(() => {
    if (promocion.revision > ultima.current.revision) ultima.current = promocion
  }, [promocion])

  const [titular, setTitular] = useState(promocion.titular ?? promocion.copy?.titular ?? '')
  const [descripcion, setDescripcion] = useState(promocion.fondoDescripcion ?? '')
  const [lineaExtra, setLineaExtra] = useState(promocion.lineaExtra ?? '')
  const resueltoInicial = resolverDeLaPromo(promocion)
  const [frase, setFrase] = useState(resueltoInicial?.frase ?? '')
  const [condicionTexto, setCondicionTexto] = useState(resueltoInicial?.condicion.texto ?? '')
  const [condicionDestacado, setCondicionDestacado] = useState(resueltoInicial?.condicion.destacado ?? '')
  // Lo escrito, al instante (los setters de arriba recién se ven en el próximo render).
  const valores = useRef<Valores>({ titular, descripcion, lineaExtra, frase, condicionTexto, condicionDestacado })
  const escribir: Record<Campo, (x: string) => void> = {
    descripcion: (x) => ((valores.current.descripcion = x), setDescripcion(x)),
    titular: (x) => ((valores.current.titular = x), setTitular(x)),
    lineaExtra: (x) => ((valores.current.lineaExtra = x), setLineaExtra(x)),
    frase: (x) => ((valores.current.frase = x), setFrase(x)),
    condicionTexto: (x) => ((valores.current.condicionTexto = x), setCondicionTexto(x)),
    condicionDestacado: (x) => ((valores.current.condicionDestacado = x), setCondicionDestacado(x)),
  }
  // Al pasar a otra plantilla (clásica ↔ diseño) los campos del diseño se vuelven a leer de lo guardado: si no, un campo
  // vacío se tomaría por "la persona lo borró" y se guardaría.
  const plantillaVista = useRef(promocion.plantilla)
  useEffect(() => {
    if (plantillaVista.current === promocion.plantilla) return
    plantillaVista.current = promocion.plantilla
    const r = resolverDeLaPromo(promocion)
    tocados.current.clear()
    escribir.frase(r?.frase ?? '')
    escribir.condicionTexto(r?.condicion.texto ?? '')
    escribir.condicionDestacado(r?.condicion.destacado ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promocion.plantilla])
  const tocados = useRef(new Set<Campo>())
  const [avisos, setAvisos] = useState<string[]>([])
  const [urlFinal, setUrlFinal] = useState(placaUrl)
  const [reutilizada, setReutilizada] = useState(false)
  const [ampliada, setAmpliada] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardados, setGuardados] = useState<ReadonlySet<Campo>>(new Set())
  const opciones = opcionesPropias ?? opcionesDeImagen('promocion', motorInicial)
  // Con la copia fiel el motor por defecto es el que escribe mejor los textos; lo que la persona elige manda siempre.
  const [motorElegido, setMotor] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(VARIANTES)
  // La imagen nueva de un cambio pedido (y de cuál se pidió): si es de la tanda se puede usar en las otras placas.
  const [nueva, setNueva] = useState<{ desde: string; id: string; hecho: number | null } | null>(null)
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  const accion = usarAccion()
  const router = useRouter()

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
    // Lo que se guardó cambia la placa: lo que el servidor dibuja en otros pasos (el resumen "Tu promoción") se vuelve a leer.
    router.refresh()
    return true
  }

  /** Guarda lo escrito que falte. Devuelve false si no se pudo (el error queda a la vista). */
  function guardarPendiente(): Promise<boolean> {
    return enCola(async () => {
      const { campos, cuales } = pendientes(valores.current, ultima.current, tocados.current)
      if (cuales.length === 0) return true
      const enviados = { ...valores.current }
      setGuardando(true)
      const ok = await enviar(campos)
      setGuardando(false)
      if (!ok) return false
      // Lo que el servidor normalizó vuelve al campo, salvo que la persona haya seguido escribiendo.
      const p = ultima.current
      const rg = resolverDeLaPromo(p)
      const guardado: Valores = { descripcion: p.fondoDescripcion ?? '', titular: p.titular ?? p.copy?.titular ?? '', lineaExtra: p.lineaExtra ?? '', frase: rg?.frase ?? '', condicionTexto: rg?.condicion.texto ?? '', condicionDestacado: rg?.condicion.destacado ?? '' }
      for (const c of cuales) if (valores.current[c] === enviados[c]) escribir[c](guardado[c])
      for (const c of cuales) tocados.current.delete(c)
      if (cuales.includes('condicionTexto')) tocados.current.delete('condicionDestacado')
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
  }, [descripcion, titular, lineaExtra, frase, condicionTexto, condicionDestacado, puede, esperaGuardadoMs])
  // La vista previa sigue lo que se escribe, aun sin guardar: un campo vacío vuelve al titular del texto elegido.
  const textos = textosParaPlaca({
    marca,
    modelo: promocion.modelo,
    datos: promocion.datos,
    titular: titular.trim() === '' ? promocion.titular : titular.trim(),
    titularDelTexto: promocion.copy?.titular ?? null,
    lineaExtra: lineaExtra.trim() === '' ? null : lineaExtra.trim(),
    ...(ocultosDeClasica(promocion.plantilla, promocion.diseno) ? { ocultos: ocultosDeClasica(promocion.plantilla, promocion.diseno)! } : {}),
  })
  const contexto = useContextoDiseno()
  const manifiesto = contexto.manifiesto ?? MANIFIESTO_VACIO
  const esDiseno = esPlantillaDiseno(promocion.plantilla)
  const esCopia = esCopiaFiel(promocion.plantilla)
  const motor = motorElegido ?? (esCopia ? MOTOR_COPIA_POR_DEFECTO : opciones.motorPorDefecto)
  // El diseño que se está escribiendo manda sobre el guardado: la vista previa sigue lo que tecleás.
  const disenoVivo: Diseno | null = esDiseno || esCopia
    ? { ...(promocion.diseno ?? {}), ...(frase.trim() !== '' ? { frase: frase.trim() } : {}), condicion: { texto: condicionTexto.trim(), destacado: condicionDestacado.trim() } }
    : null
  const paraDiseno = { marcaId: promocion.marcaId, datos: promocion.datos, diseno: promocion.diseno, referencia: plantillaLeida }
  // La plantilla de la referencia toma de la lectura sus letras e inclinaciones de fábrica.
  const resueltoVivo = esPlantillaDiseno(promocion.plantilla) ? resolverDiseno(disenoVivo, promocion.plantilla, { modelo: promocion.modelo, titular: promocion.titular ?? promocion.copy?.titular ?? '', datos: promocion.datos }, plantillaLeida ?? undefined) : null
  const deFabrica = promocion.plantilla === 'referencia' && plantillaLeida ? resolverDiseno(null, 'referencia', { modelo: promocion.modelo, titular: '', datos: promocion.datos }, plantillaLeida).inclinacion : undefined
  // Copia fiel (ADR-040): lo que escribe la IA y la línea tal como se le va a pedir (los logos: si la concesionaria no tiene uno dibujable, la IA escribe su nombre).
  const resueltoCopia = esCopia ? resolverDiseno(disenoVivo, 'impactante_textura', { modelo: promocion.modelo, titular: promocion.titular ?? promocion.copy?.titular ?? '', datos: promocion.datos }) : null
  const lineaCopia = esCopia
    ? textosVisibles(
        textosCopiaFiel({ modelo: promocion.modelo, titular: promocion.titular, copy: promocion.copy, datos: promocion.datos, diseno: disenoVivo } as unknown as FilaPromocion, { negocio: marca, logoDibujable: logoDibujable(manifiesto, promocion.marcaId) }),
      ).join(' · ')
    : ''
  const hayLecturaLista = plantillaLeida !== null
  const creativos = escenas.flatMap((e) => e.creativos)
  const generacionDe = (creativoId: string): GeneracionVista | null => escenas.find((e) => e.creativos.some((c) => c.id === creativoId))?.generacion ?? null
  /** Copia fiel: por qué una imagen NO se puede usar en la placa (null = se puede). Una imagen sin revisión OK, o de textos viejos, no sirve. */
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
  const avisoFondo = esCopia ? null : avisoDeFondo(promocion.plantilla, fondoDeLaEscena(promocion.escenaCreativoId, escenas))
  const escenaUrl = creativos.find((c) => c.id === promocion.escenaCreativoId)?.url ?? null
  // Con la plantilla de la referencia la vista previa (gratis) se ve ANTES de generar la imagen: con la foto de la moto en su lugar.
  const soloFoto = escenaUrl === null && promocion.plantilla === 'referencia' && plantillaLeida !== null
  const escenaParaVer = escenaUrl ?? (soloFoto ? fotoUrl : null)
  const faltaFondo = !esCopia && esFondo(promocion.fondo) && faltaPedidoDeFondo(promocion.fondo, descripcion, promocion.inspiracionFotoId !== null)
  // La copia fiel no tiene fondo que elegir: copia el de la referencia (por eso la foto de referencia es lo único que tiene que haber).
  const listoParaEstimar = esCopia ? promocion.inspiracionFotoId !== null : promocion.plantilla !== null && promocion.fondo !== null
  const pendiente = pendientes({ descripcion, titular, lineaExtra, frase, condicionTexto, condicionDestacado }, promocion, tocados.current).cuales
  const aPedir: EscenaResumen | null = listoParaEstimar && !esCopia
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

  /** Lo que saldría generar otra imagen (tope informativo por imagen × variantes; el precio exacto lo da "Ver precio"). */
  const topeImagen = opciones.topePorImagen[motor]?.[promocion.inspiracionFotoId ? 'conInspiracion' : 'conFoto']
  const precioDeOtra = topeImagen ? formatearUsdCorto(topeImagen * cantidad, { estimado: true }) : null
  // Copia fiel: una variante más = imagen + revisión de textos (lo que se ve acá es aproximado; el precio exacto lo da "Ver precio").
  const precioDeOtraCopia = topeImagen && verificacionUsd ? formatearUsdCorto(topeImagen + verificacionUsd, { estimado: true }).replace('~', '~') : null
  const limites = limitesTexto(esPlantilla(promocion.plantilla) ? posicionDeClave(promocion.plantilla) : 'abajo')
  const extraConEmoji = tieneEmoji(lineaExtra)
  const plantillaActual = esPlantillaClasica(promocion.plantilla) ? promocion.plantilla : null
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

  /**
   * Una plantilla de diseño: la moto va al centro. Sin imagen todavía, el fondo sugerido es el estudio de su color; con una imagen
   * ya hecha el fondo NO se toca (el resumen "Se va a pedir con" diría lo que la imagen no tiene): el aviso de abajo sugiere el suyo.
   */
  async function elegirPlantillaDiseno(id: (typeof IDS_PLANTILLA_DISENO)[number]) {
    // 'Como tu referencia' usa el fondo que ya hay: el ambiente sale de la foto de referencia (la escena v6 pide su paleta).
    if (id === 'referencia') return cambiar({ plantilla: 'referencia', posicionMoto: 'centro' })
    const conservar = promocion.escenaCreativoId !== null && promocion.fondo !== null
    await cambiar({ plantilla: id, posicionMoto: 'centro', ...(conservar ? {} : { fondo: PLANTILLAS_DISENO[id].fondoSugerido }) })
  }

  /** La copia fiel (ADR-040): se guarda con "Diseño completo" y, si viene una foto, con esa referencia, todo en UN guardado (gratis). */
  async function elegirCopiaFiel(foto?: { id: string }) {
    await cambiar({ plantilla: 'copia_fiel', inspiracionModo: 'diseno', ...(foto ? { inspiracionFotoId: foto.id } : {}) })
  }

  /** El botón del aviso: elige el fondo de la plantilla y lleva a "Ver precio". No estima ni confirma nada. */
  async function elegirFondoSugerido(fondo: string) {
    await cambiar({ fondo })
    document.getElementById('generar-imagen')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  /** Un control del panel de diseño: guarda al instante, uniendo lo que cambió con lo guardado. */
  async function cambiarDiseno(cambio: Diseno) {
    await cambiar({ diseno: { ...(ultima.current.diseno ?? {}), ...cambio } })
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
    router.refresh()
  }

  if (!abierta) {
    return (
      <section>
        <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda="El diseño y la imagen de esta promoción." />
        <Estado>{promocion.estado === 'aprobada' ? 'Está aprobada: para cambiar algo tocá "Volver a editar" en el paso 5.' : 'Esta promoción está descartada.'}</Estado>
      </section>
    )
  }

  const bloqueImagen = (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Imagen</h3>
        <VersionesImagen
          versiones={versionesDeImagen(escenas.map((e) => e.generacion), creativos)}
          alt={(_c, i) => `Imagen generada ${i + 1}`}
          puedeEditar={puedeEditar}
          usar={{ modo: 'radio', elegidoId: promocion.escenaCreativoId, alElegir: (id) => void cambiar({ escenaCreativoId: id }), bloqueado: !puede || cargando, ...(esCopia ? { bloqueoDe: bloqueoDeCopia } : {}) }}
          vacio={deTanda ? 'La tanda todavía no generó ninguna imagen para esta moto.' : 'Todavía no generaste ninguna imagen para esta promoción.'}
          accionesDe={(c, v) =>
            c.url ? (
              <>
              {c.verificacion && (
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
              )}
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
              </>
            ) : null
          }
        />
        {deTanda && <ImagenDeLaTanda promocion={promocion} descripcion={descripcion} inspiracion={promocion.inspiracionFotoId && inspiracion ? inspiracion : null} tandaId={promocion.tandaId!} />}
      </div>
  )

  const controles = (
    <>
        {deTanda && bloqueImagen}

        <fieldset role="radiogroup" aria-label="Plantillas de diseño" disabled={!puede || cargando} className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-medium">Plantillas de diseño</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <TarjetaCopiaFiel
                key={promocion.inspiracionFotoId ?? 'sin-foto'}
                elegida={esCopia}
                puedeEditar={puedeEditar}
                bloqueado={!puede || cargando}
                foto={promocion.inspiracionFotoId !== null ? (inspiracion ?? { id: promocion.inspiracionFotoId, url: null, borrada: false }) : null}
                inspiraciones={inspiraciones}
                {...(comprimirFoto ? { comprimirFoto } : {})}
                alElegir={(f) => void elegirCopiaFiel(f)}
              />
            {IDS_PLANTILLA_DISENO.filter((id) => id !== 'referencia').map((id) => (
              <label key={id} className={`${tarjetaOpcion} flex-col`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="plantilla-diseno" checked={promocion.plantilla === id} onChange={() => void elegirPlantillaDiseno(id)} />
                  <span className="font-medium">{PLANTILLAS_DISENO[id].nombre}</span>
                </span>
                {fotoUrl && <VistaPlaca decorativa escenaSrc={fotoUrl} textos={textos} plantilla={id} aspecto={promocion.aspecto} fuentes={fuentes} promocion={{ ...paraDiseno, diseno: null }} />}
                <span className="text-xs text-(--color-tenue)">{PLANTILLAS_DISENO[id].descripcion}</span>
              </label>
            ))}
            {/* "Como tu referencia" (ADR-039) ya no se ofrece (ADR-040): una promoción que ya la usa sigue andando con su lectura. */}
            {promocion.plantilla === 'referencia' && hayLecturaLista && (
              <label className={`${tarjetaOpcion} flex-col`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="plantilla-diseno" checked onChange={() => void elegirPlantillaDiseno('referencia')} />
                  <span className="font-medium">{PLANTILLAS_DISENO.referencia.nombre}</span>
                </span>
                {fotoUrl && <VistaPlaca decorativa escenaSrc={fotoUrl} textos={textos} plantilla="referencia" aspecto={promocion.aspecto} fuentes={fuentes} promocion={{ ...paraDiseno, diseno: null }} />}
                <span className="text-xs text-(--color-tenue)">{PLANTILLAS_DISENO.referencia.descripcion}</span>
              </label>
            )}
          </div>
        </fieldset>

        {avisoFondo && (
          <AvisoFondo
            nombre={avisoFondo.nombre}
            yaElegido={promocion.fondo === avisoFondo.sugerido}
            precio={precioDeOtra}
            tandaId={deTanda ? promocion.tandaId : null}
            puedeElegir={puede && !deTanda}
            deshabilitado={cargando}
            alElegir={() => void elegirFondoSugerido(avisoFondo.sugerido)}
          />
        )}

        {esDiseno && puedeEditar && resueltoVivo && esPlantillaDiseno(promocion.plantilla) && (
          <AjustesDiseno
            plantilla={promocion.plantilla}
            resuelto={resueltoVivo}
            valores={{ frase, condicionTexto, condicionDestacado }}
            onEscribir={(c, x) => (tocados.current.add(c), escribir[c](x))}
            onBlur={() => void guardarPendiente()}
            indicador={(c) => indicador(c)}
            onCambiar={(c) => void cambiarDiseno(c)}
            deshabilitado={!puede || cargando}
            logosMarca={logosDeMarca(manifiesto, promocion.marcaId)}
            avisosLogo={avisosLogo(manifiesto, promocion.marcaId, plantillaLeida ? tonoDeReferencia(plantillaLeida) : PLANTILLAS_DISENO[promocion.plantilla].tono, resueltoVivo.logoMarca)}
            guardado={promocion.diseno}
            {...(plantillaLeida ? { acentoOriginal: plantillaLeida.acento } : {})}
            {...(deFabrica ? { inclinacionDeFabrica: deFabrica } : {})}
          />
        )}

        {esCopia && puedeEditar && resueltoCopia && (
          <TextosCopiaFiel
            resuelto={resueltoCopia}
            valores={{ frase, condicionTexto, condicionDestacado }}
            onEscribir={(c, x) => (tocados.current.add(c), escribir[c](x))}
            onBlur={() => void guardarPendiente()}
            indicador={(c) => indicador(c)}
            onCambiar={(c) => void cambiarDiseno(c)}
            deshabilitado={!puede || cargando}
            fijos={{ modelo: promocion.modelo, precio: textos.precio, lugar: textos.lugar }}
            lineaPedida={lineaCopia}
          />
        )}

        {!esCopia && (
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
        )}

        {!esDiseno && !esCopia && promocion.inspiracionFotoId !== null && promocion.inspiracionModo === 'diseno' && puedeEditar && (
          <div role="note" className="space-y-2 rounded-lg border border-(--color-borde) px-4 py-3 text-sm">
            <p>Con ‘Diseño completo’ lo más fiel es la ‘Copia fiel de tu referencia’, en Plantillas de diseño. Si no, una plantilla de diseño ya armada: la moto va al centro y no tenés que elegir posiciones.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boton} onClick={() => document.getElementById(ID_TARJETA_COPIA)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}>
                Ir a ‘Copia fiel’
              </button>
              <button type="button" onClick={() => void elegirPlantillaDiseno('impactante_textura')} disabled={!puede || cargando} className={boton}>
                Usar plantilla Impactante
              </button>
            </div>
          </div>
        )}

        {!esDiseno && !esCopia && (
        <>
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
        </>
        )}

        {!deTanda && (
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
            inspiraciones={inspiraciones}
            modoInspiracion={promocion.inspiracionModo}
            onModoInspiracion={(modo) => void cambiar({ inspiracionModo: modo })}
            pistaInspiracion="Para copiar una placa entera (con sus textos), usá ‘Copia fiel de tu referencia’ en Plantillas."
            {...(comprimirFoto ? { comprimirFoto } : {})}
            conFondo={!esCopia}
            calidadAbierta={esCopia}
            {...(esCopia
              ? {
                  leyendaDeMotor: (m: { id: string }) =>
                    m.id === MOTOR_COPIA_POR_DEFECTO ? 'Escribe mejor los textos' : 'Más barato, pero escribe peor: puede que tengas que generar otra',
                }
              : {})}
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
              deshabilitado={!puede || !listoParaEstimar || faltaFondo || guardando}
              antes={guardarPendiente}
              seVaAPedir={aPedir}
              topeUsd={topeUsd}
              gastadoUsd={gastadoUsd}
              explicacion={
                esCopia
                  ? `Ver precio no cuesta nada: te muestra cuánto sale antes de gastar. Se generan ${cantidad} ${cantidad === 1 ? 'variante' : 'variantes'} y cada una se revisa sola (los textos tienen que coincidir con lo que cargaste).`
                  : `Ver precio no cuesta nada: te muestra cuánto sale antes de gastar. Se generan ${cantidad} ${cantidad === 1 ? 'variante' : 'variantes'} para que elijas.`
              }
              {...(esCopia
                ? {
                    textoCorriendo: 'Generando y revisando los textos… puede tardar hasta 3 minutos',
                    desglose: (d: { cantidad: number; verificacionUsd?: number; costoEstimadoUsd: number }) =>
                      `${d.cantidad} ${d.cantidad === 1 ? 'imagen' : 'imágenes'} + revisión de textos${d.verificacionUsd ? ` (${formatearUsdCorto(d.verificacionUsd, { estimado: true })} c/u)` : ''}. El tope incluye todo; el costo real puede ser menor.`,
                  }
                : {})}
              despuesDeListo="Elegí una imagen abajo."
              pedir={() => postEstimacionPromocion({ promocionId: ultima.current.id, motor, cantidad })}
            >
              {!listoParaEstimar && <p className="text-xs text-(--color-tenue)">{esCopia ? 'Primero elegí la foto de tu referencia.' : 'Primero elegí el diseño y el fondo.'}</p>}
              {faltaFondo && <p className="text-xs text-(--color-falta)">{MENSAJE_FALTA_DESCRIPCION}</p>}
            </CompuertaImagen>
          </div>
          </>
        )}

        {!deTanda && bloqueImagen}

        {!esDiseno && !esCopia && (
        <>
        {puedeEditar && promocion.plantilla !== null && (
          <MostrarTextos clasica ocultos={promocion.diseno?.ocultos ?? []} onCambiar={(ocultos) => void cambiarDiseno({ ocultos })} deshabilitado={!puede || cargando} />
        )}

        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Texto de la placa</h3>
          <p className="text-xs text-(--color-tenue)">Titular y línea extra: van escritos en la imagen.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="promo-titular" className="text-sm font-medium">
            Titular
          </label>
          <input id="promo-titular" className={campo} value={titular} maxLength={limites.titular} disabled={!puede} onChange={(e) => escribir.titular(e.target.value)} onBlur={() => void guardarPendiente()} />
          <p className="text-xs text-(--color-tenue) tabular-nums">{titular.length}/{limites.titular} · Sin montos: el precio va aparte (cuotas, años y km sí).</p>
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
        </>
        )}

    </>
  )

  // UNA sola placa a la vista: la final, cuando está armada y al día con lo que hay en pantalla; si no, la vista previa viva.
  const mostrarFinal = promocion.placaLista && urlFinal !== null && pendiente.length === 0
  const previa = (
    <>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{mostrarFinal ? 'Imagen final' : 'Así queda'}</h3>
          {mostrarFinal ? (
            <figure className="mx-auto max-w-sm space-y-1">
              <ImagenAmpliable src={urlFinal} alt={`Imagen final de ${promocion.modelo}`} className="border border-(--color-borde)" />
              <figcaption className="text-xs text-(--color-tenue)">{reutilizada ? 'Lista: la imagen final ya tenía estos cambios.' : 'Imagen final lista.'}</figcaption>
            </figure>
          ) : esCopia ? (
            <div className="mx-auto max-w-sm space-y-2" data-testid="previa-copia-fiel">
              {escenaUrl === null ? (
                <p className="text-sm text-(--color-tenue)">Generá la imagen para verla.</p>
              ) : (
                <>
                  <ImagenAmpliable src={escenaUrl} alt={`Imagen de la copia fiel de ${promocion.modelo}`} className="border border-(--color-borde)" />
                  <p className="text-xs text-(--color-tenue)">La IA escribió los textos en la imagen. “Ver la versión final” le pega el logo de tu concesionaria (gratis).</p>
                  {textosVencidos && (
                    <p role="alert" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm">
                      Cambiaste los textos: la imagen tiene los anteriores. Generá otra{precioDeOtraCopia ? ` (${precioDeOtraCopia})` : ''}.
                    </p>
                  )}
                  {!textosVencidos && creativoElegido !== null && !copiaUsable && <p className="text-xs text-(--color-falta)">Esta imagen no se puede usar hasta que sus textos estén revisados y coincidan: elegí otra o generá de nuevo.</p>}
                </>
              )}
            </div>
          ) : escenaParaVer ? (
            <div className="mx-auto max-w-sm space-y-2">
              {soloFoto && <p className="text-xs text-(--color-tenue)">Así queda el diseño de tu referencia con tu foto. Falta generar la imagen: el fondo va a tener los colores de la referencia.</p>}
              <VistaPlaca escenaSrc={escenaParaVer} textos={textos} plantilla={esPlantilla(promocion.plantilla) ? promocion.plantilla : 'oferta_abajo'} posicionMoto={promocion.posicionMoto} aspecto={promocion.aspecto} fuentes={fuentes} promocion={paraDiseno} disenoVivo={disenoVivo} />
              <button type="button" className={boton} onClick={() => setAmpliada(true)}>
                Ampliar la vista previa
              </button>
              <Lightbox abierto={ampliada} alCerrar={() => setAmpliada(false)} titulo="Vista previa ampliada">
                <VistaPlaca escenaSrc={escenaParaVer} textos={textos} plantilla={esPlantilla(promocion.plantilla) ? promocion.plantilla : 'oferta_abajo'} posicionMoto={promocion.posicionMoto} aspecto={promocion.aspecto} fuentes={fuentes} promocion={paraDiseno} disenoVivo={disenoVivo} />
              </Lightbox>
            </div>
          ) : (
            <p className="text-sm text-(--color-tenue)">Elegí una imagen para ver cómo queda con el texto.</p>
          )}
          {!mostrarFinal && !esCopia && <p className="text-xs text-(--color-tenue)">Es una vista previa aproximada. La imagen final se arma al tocar el botón de abajo.</p>}
          {cargando && <p role="status" className="text-sm text-(--color-tenue)">Trabajando…</p>}
        </div>

        {avisos.length > 0 && <Estado>{avisos.join(' ')}</Estado>}
        <ListaErrores errores={[...errores, ...accion.errores]} conflicto={conflicto || accion.conflicto} alRecargar={accion.recargar} />

        {(puedeEditar || promocion.placaLista) && (
          <BarraAccion>
            {puedeEditar && (
              <button type="button" className={promocion.placaLista ? boton : botonPrincipal} disabled={!puede || cargando || extraConEmoji || !promocion.escenaCreativoId || !promocion.plantilla || (esCopia && !copiaUsable)} onClick={() => void versionFinal()}>
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
      <TituloPaso numero={4} pregunta="¿Cómo querés que se vea?" leyenda="Elegí el diseño y el fondo, generá la imagen y revisá cómo queda con el texto encima." />
      <EditorConVistaPrevia controles={controles} previa={previa} />
    </section>
  )
}

/**
 * La imagen se hizo con un fondo que no es el de la plantilla elegida. No bloquea nada: avisa, dice cuánto saldría otra y deja
 * seguir con la actual. El botón solo ELIGE el fondo; generar sigue pasando por "Ver precio" y "Confirmar".
 */
function AvisoFondo({ nombre, yaElegido, precio, tandaId, puedeElegir, deshabilitado, alElegir }: { nombre: string; yaElegido: boolean; precio: string | null; tandaId: string | null; puedeElegir: boolean; deshabilitado: boolean; alElegir: () => void }) {
  const costo = precio ? ` (${precio})` : ''
  return (
    <div role="note" data-testid="aviso-fondo" className="space-y-2 rounded-lg border border-(--color-aviso) px-4 py-3 text-sm">
      <p>
        Esta plantilla queda mejor con {nombre}.{' '}
        {tandaId
          ? 'La imagen es de la tanda: podés generar otra con ese fondo allá o seguir con la actual.'
          : yaElegido
            ? `Ya está elegido: tocá "Ver precio" para generar otra imagen con ese fondo${costo} o seguí con la actual.`
            : `Podés generar otra imagen con ese fondo${costo} o seguir con la actual.`}
      </p>
      {tandaId ? (
        <Link href={`/promocionar/tanda/${tandaId}`} className="inline-block text-sm underline underline-offset-2">
          Ir a la tanda →
        </Link>
      ) : (
        puedeElegir &&
        !yaElegido && (
          <button type="button" className={boton} disabled={deshabilitado} onClick={alElegir}>
            Elegir ese fondo
          </button>
        )
      )}
    </div>
  )
}

/** Cómo se generó la imagen de la tanda, plegado y solo para leer; cambiarlo o generar otra se hace en la tanda. */
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
    <div className="space-y-2" data-testid="imagen-de-la-tanda">
      <details className="rounded-lg border border-(--color-borde) px-4 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Cómo se generó esta imagen</summary>
        <div className="mt-2 space-y-2">
          <p>
            Fondo: {fondo}
            {d !== '' && <> · descripción: «{d}»</>}
            {' · '}moto: {promocion.posicionMoto ?? 'centro'}
          </p>
          {inspiracion && (
            <div className="flex items-center gap-2">
              <span>Foto de inspiración usada:</span>
              {inspiracion.url && !inspiracion.borrada ? <img src={inspiracion.url} alt="Foto de inspiración usada" className="h-14 w-14 rounded-md border border-(--color-borde) object-cover" /> : <span className="text-(--color-tenue)">(la foto se borró)</span>}
            </div>
          )}
        </div>
      </details>
      <Link href={`/promocionar/tanda/${tandaId}`} className="inline-block text-sm underline underline-offset-2">
        Cambiar el fondo o generar otra en la tanda →
      </Link>
    </div>
  )
}
