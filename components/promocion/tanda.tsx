'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { postEstimacionTanda } from '@/components/creativos/api'
import { CompuertaImagen } from '@/components/imagenes/compuerta-imagen'
import { OpcionesImagen } from '@/components/imagenes/opciones-imagen'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import { formatearUsd } from '@/lib/estratega/formato'
import { opcionesDeImagen } from '@/lib/imagenes/opciones'
import { versionesDeImagen } from '@/lib/productor/pantalla'
import { fondoAlDescribir } from '@/lib/promocion/fondos'
import { faltaPedidoDeFondo, limpiarDescripcion, MENSAJE_FALTA_DESCRIPCION } from '@/lib/promocion/escena'
import { formatearCostoLote } from '@/lib/promocion/costos'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { ESTILOS, limitesTexto, POSICIONES } from '@/lib/promocion/plantillas'
import type { TandaVista } from '@/lib/promocion/tanda/pantalla'
import { esFondo, esPlantilla, ESTILOS_PLACA, estiloDe, plantillaDe, POSICIONES_MOTO, POSICIONES_TEXTO, posicionTextoDe, type EstiloPlaca, type PosicionMoto, type PosicionTexto, type PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postAntecedentes, postTextos, type Fallo } from './api'
import { rotuloLote } from '@/lib/promocion/lote/grupos'
import { EdicionTexto } from './edicion-texto'
import { ImagenesLote } from './imagenes-lote'
import { enLotes } from './lote'
import { TextoDePieza } from './texto-de-pieza'
import { boton, botonPrincipal, campo, Estado, tarjetaOpcion } from './ui'

/** Cuántas llamadas van en vuelo a la vez: el modelo no se satura y un error no frena a las demás. */
const CONCURRENCIA = 3
const VARIANTES = 2
const NOMBRE_MOTO: Record<PosicionMoto, string> = { izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha' }

type Fase = 'quieta' | 'trabajando' | 'ok' | 'error'
type Estadito = { promocion: PromocionVista; fase: Fase; mensaje: string | null }
type Resultado = { ok: true; promocion: PromocionVista } | Fallo
type Operacion = (h: PromocionVista) => Promise<Resultado>

const titulo = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Texto, imagen y diseño elegidos: se puede aprobar (la placa la arma el servidor al aprobar). */
const estaLista = (p: PromocionVista) => p.estado === 'borrador' && p.copy !== null && p.escenaCreativoId !== null && p.plantilla !== null

/** Qué le falta a una pieza en borrador para poder aprobarla, en castellano. */
function faltaDe(p: PromocionVista, tieneOpciones: boolean): string[] {
  const falta: string[] = []
  if (p.copy === null) falta.push(tieneOpciones ? 'elegir el texto' : 'escribir los textos')
  if (p.plantilla === null || p.fondo === null) falta.push('diseño y fondo')
  if (p.escenaCreativoId === null) falta.push('imagen')
  return falta
}

/**
 * La tanda: una promoción por marca, una pantalla. Los lotes (analizar, escribir, diseño,
 * imagen, aprobar) son UN click que muestra el total y corre las llamadas de siempre por
 * promoción con concurrencia 3; cada tarjeta tiene su estado y su reintento (ADR-028).
 * La imagen sigue siendo la compuerta de costo: Ver precio → Confirmar US$ X.
 */
export function Tanda({
  tanda,
  puedeEditar,
  habilitado,
  costoAntecedentesUsd,
  costoTextosUsd,
  apagado,
  topeUsd,
  motor: motorInicial,
  periodo,
  comprimirFoto,
  esperaGuardadoMs,
}: {
  tanda: TandaVista
  puedeEditar: boolean
  /** Hay clave de OpenAI (el booleano, nunca el valor). */
  habilitado: boolean
  costoAntecedentesUsd: number | null
  costoTextosUsd: number | null
  /** Por qué no se puede generar la imagen (sin clave o sin tope), en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  motor: string
  /** El período de la pantalla (?desde&hasta): el análisis de cada promoción mira el mismo que la comparación. */
  periodo?: { desde: string; hasta: string }
  /** Solo para probar la subida de la foto de inspiración sin un navegador real. */
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Solo para probar el guardado automático del texto de cada pieza sin esperar. */
  esperaGuardadoMs?: number
}) {
  const router = useRouter()
  const vivas = tanda.hijas.filter((h) => h.promocion.estado !== 'descartada')
  const [estado, setEstado] = useState<Record<string, Estadito>>(() => Object.fromEntries(vivas.map((h) => [h.promocion.id, { promocion: h.promocion, fase: 'quieta', mensaje: null }])))
  // Si el servidor trae una revisión más nueva (después de un refresh), esa manda.
  for (const h of vivas) {
    const local = estado[h.promocion.id]
    if (!local || h.promocion.revision > local.promocion.revision) setEstado((e) => ({ ...e, [h.promocion.id]: { promocion: h.promocion, fase: 'quieta', mensaje: null } }))
  }
  const [resumen, setResumen] = useState<string | null>(null)
  // Lo que se aplica a todas parte de lo que ya tiene la primera promoción en borrador.
  const base = vivas.map((h) => h.promocion).find((p) => p.estado === 'borrador')
  const [estilo, setEstilo] = useState<EstiloPlaca>(base && esPlantilla(base.plantilla) ? estiloDe(base.plantilla) : 'degradado')
  const [posicion, setPosicion] = useState<PosicionTexto>(base && esPlantilla(base.plantilla) ? posicionTextoDe(base.plantilla) : 'abajo')
  const [fondo, setFondo] = useState<string>(base?.fondo ?? 'fondo_estudio')
  const [moto, setMoto] = useState<PosicionMoto>(base?.posicionMoto ?? 'centro')
  const [descripcion, setDescripcion] = useState(base?.fondoDescripcion ?? '')
  const [lineaExtra, setLineaExtra] = useState(base?.lineaExtra ?? '')
  const [inspiracion, setInspiracion] = useState<{ id: string; url: string | null } | null>(tanda.inspiracion && !tanda.inspiracion.borrada ? { id: tanda.inspiracion.id, url: tanda.inspiracion.url } : null)
  const enCurso = useRef(false)
  const [corriendo, setCorriendo] = useState(false)
  const ultima = useRef<Record<string, Operacion>>({})
  const opciones = opcionesDeImagen('promocion', motorInicial)
  const [motor, setMotor] = useState(opciones.motorPorDefecto)
  const [cantidad, setCantidad] = useState(VARIANTES)

  const ps = vivas.map((h) => estado[h.promocion.id]?.promocion ?? h.promocion)
  const borradores = ps.filter((p) => p.estado === 'borrador')
  const listas = ps.filter(estaLista)
  const aprobadas = ps.filter((p) => p.estado === 'aprobada')
  const puede = puedeEditar && !corriendo
  const n = borradores.length
  const creativos = tanda.escenas.flatMap((e) => e.creativos)
  const esMotos = tanda.tipo === 'motos'
  const esTextos = tanda.tipo === 'textos'
  // "TRK 502 · 3 marcas", "5 motos · Benelli Store Quilmes", "TRK 502 · 3 textos".
  const rotulo = rotuloLote(tanda.tipo, ps.map((p) => ({ modelo: p.modelo, marca_id: p.marcaId, grupo: p.grupo, variante: p.variante })))

  function poner(id: string, parcial: Partial<Estadito>) {
    setEstado((e) => ({ ...e, [id]: { ...e[id]!, ...parcial } }))
  }

  /** Corre `op` sobre cada promoción (3 a la vez). Un doble click no lanza dos lotes. */
  /** Devuelve cuántas fallaron (o null si no corrió: otro lote en curso o nada que hacer). */
  async function lote(destino: readonly PromocionVista[], op: Operacion, ok: (cuantas: number) => string): Promise<number | null> {
    if (enCurso.current || destino.length === 0) return null
    enCurso.current = true
    setCorriendo(true)
    setResumen(null)
    for (const p of destino) {
      ultima.current[p.id] = op
      poner(p.id, { fase: 'trabajando', mensaje: null })
    }
    const resultados = await enLotes(destino, CONCURRENCIA, (p) => op(p))
    let bien = 0
    destino.forEach((p, i) => {
      const r = resultados[i]!
      if (r instanceof Error) poner(p.id, { fase: 'error', mensaje: 'No se pudo completar. Probá de nuevo.' })
      else if (!r.ok) poner(p.id, { fase: 'error', mensaje: r.errores && r.errores.length > 0 ? r.errores.join(' ') : r.error })
      else {
        bien++
        poner(p.id, { fase: 'ok', promocion: r.promocion, mensaje: null })
      }
    })
    const mal = destino.length - bien
    setResumen(`${ok(bien)}${mal > 0 ? `, ${plural(mal, 'con error', 'con error')}` : ''}`)
    enCurso.current = false
    setCorriendo(false)
    router.refresh()
    return mal
  }

  const analizar = () => lote(borradores, async (p) => postAntecedentes(p.id, periodo).then((r) => (r.ok ? { ok: true as const, promocion: r.promocion } : r)), (k) => `${plural(k, 'análisis hecho', 'análisis hechos')}`)
  const escribir = () => lote(borradores, async (p) => postTextos(p.id, { revision: p.revision }).then((r) => (r.ok ? { ok: true as const, promocion: r.promocion } : r)), (k) => `${plural(k, 'texto escrito', 'textos escritos')}`)
  const limites = limitesTexto(posicion)
  const extraConEmoji = /\p{Extended_Pictographic}/u.test(lineaExtra)
  // Al costado la moto no puede quedar al centro (el texto va del lado opuesto): se resuelve acá, antes de mandar.
  const motoFinal: PosicionMoto = posicion === 'costado' && moto === 'centro' ? 'izquierda' : moto
  const descLote = descripcion.trim() === '' ? null : descripcion.trim()
  const extraLote = lineaExtra.trim() === '' ? null : lineaExtra.trim()
  // Lo del formulario que todavía no está en las promociones (la estimación lee lo guardado).
  const sinAplicar = borradores.some(
    (p) =>
      p.plantilla !== plantillaDe(estilo, posicion) ||
      p.fondo !== fondo ||
      p.posicionMoto !== motoFinal ||
      (p.fondoDescripcion ?? null) !== (descLote === null ? null : limpiarDescripcion(descLote)) ||
      (p.lineaExtra ?? null) !== extraLote ||
      (p.inspiracionFotoId ?? null) !== (inspiracion?.id ?? null),
  )
  const faltaFondo = esFondo(fondo) && faltaPedidoDeFondo(fondo, descripcion, inspiracion !== null)
  function escribirDescripcion(x: string) {
    // La primera descripción con el estudio por defecto: el fondo pasa a "solo mi descripción".
    const nuevo = fondoAlDescribir(fondo, descripcion, x)
    if (nuevo) setFondo(nuevo)
    setDescripcion(x)
  }
  const aplicarDiseno = () =>
    lote(
      borradores,
      (p) =>
        patchPromocion(p.id, {
          revision: p.revision,
          plantilla: plantillaDe(estilo, posicion),
          fondo,
          posicionMoto: motoFinal,
          fondoDescripcion: descripcion.trim() === '' ? null : descripcion.trim(),
          lineaExtra: lineaExtra.trim() === '' ? null : lineaExtra.trim(),
          inspiracionFotoId: inspiracion?.id ?? null,
        }),
      (k) => `Diseño y fondo aplicados en ${plural(k, 'promoción', 'promociones')}`,
    )
  const usarImagen = (creativoId: string) => lote(borradores, (p) => patchPromocion(p.id, { revision: p.revision, escenaCreativoId: creativoId }), (k) => `Imagen elegida en ${plural(k, 'promoción', 'promociones')}`)
  /** Elegir un texto no cuesta nada: manda solo el número de opción, el texto sale de lo guardado. */
  const elegirTexto = (p: PromocionVista, opcion: number) => lote([p], (h) => patchPromocion(h.id, { revision: h.revision, copyOpcion: opcion }), () => 'Texto elegido')
  const sinTextoElegido = vivas.filter((h) => {
    const p = estado[h.promocion.id]?.promocion ?? h.promocion
    return p.estado === 'borrador' && p.copy === null && h.textos !== null && !h.textos.desactualizado
  })
  const usarOpcionUno = () => lote(sinTextoElegido.map((h) => estado[h.promocion.id]?.promocion ?? h.promocion), (h) => patchPromocion(h.id, { revision: h.revision, copyOpcion: 1 }), (k) => `Opción 1 elegida en ${plural(k, 'pieza', 'piezas')}`)
  const aprobarTodas = () => lote(listas, (p) => patchPromocion(p.id, { revision: p.revision, accion: 'aprobar' }), (k) => plural(k, 'aprobada', 'aprobadas'))

  /**
   * Usa esa imagen en las placas en borrador de UNA moto. No pasa por lote(): se llama mientras se generan
   * varias motos a la vez, y cada moto toca solo sus propias promociones (cada PATCH con su revisión).
   */
  async function usarImagenEnMoto(grupo: number, creativoId: string): Promise<string | null> {
    const g = tanda.grupos.find((x) => x.grupo === grupo)
    const destino = (g?.hijaIds ?? []).map((id) => revisiones.current[id]).filter((p): p is PromocionVista => p !== undefined && p.estado === 'borrador')
    let falla: string | null = null
    if (destino.length === 0) falla = 'No hay placas en borrador de esta moto para ponerle la imagen.'
    for (const p of destino) {
      const r = await patchPromocion(p.id, { revision: revisiones.current[p.id]!.revision, escenaCreativoId: creativoId })
      if (r.ok) {
        revisiones.current[p.id] = r.promocion
        poner(p.id, { fase: 'ok', promocion: r.promocion, mensaje: null })
      } else {
        const mensaje = r.errores && r.errores.length > 0 ? r.errores.join(' ') : r.error
        poner(p.id, { fase: 'error', mensaje })
        falla ??= mensaje
      }
    }
    setResumen(`Imagen elegida en ${plural(destino.length, 'placa', 'placas')} de ${g?.modelo ?? 'la moto'}`)
    router.refresh()
    return falla
  }
  // La revisión más nueva de cada promoción, a mano para los guardados que corren en paralelo.
  const revisiones = useRef<Record<string, PromocionVista>>({})
  for (const p of ps) if (!revisiones.current[p.id] || p.revision >= revisiones.current[p.id]!.revision) revisiones.current[p.id] = p

  const sinAsistente = !habilitado ? 'Esta función está apagada en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema.' : null
  const difieren = !tanda.comparten.ok ? tanda.comparten.difieren.join(', ') : null
  const listoParaEstimar = n > 0 && (sinAplicar || borradores.every((p) => p.plantilla !== null && p.fondo !== null))

  /** Lo que no se aplicó se aplica ANTES de estimar: si falla en alguna, no se estima. */
  const aplicarAntes = async () => (sinAplicar ? (await aplicarDiseno()) === 0 : true)

  const sinTextos = borradores.some((p) => p.copy === null && !vivas.some((h) => h.promocion.id === p.id && h.textos !== null))
  const siguiente =
    sinTextos
      ? `escribir los textos de las que no tienen (botón "Escribir textos").`
      : sinTextoElegido.length > 0
        ? `elegir el texto de cada pieza (abajo, en "Piezas") o usar la opción 1 en todas.`
        : borradores.some((p) => p.plantilla === null || p.fondo === null) || sinAplicar
          ? 'elegir el diseño y el fondo y aplicarlos a todas.'
          : borradores.some((p) => p.escenaCreativoId === null)
            ? 'ver el precio de la imagen y elegirla.'
            : listas.length > 0
              ? 'aprobar las listas.'
              : 'revisar las piezas.'

  const tarjeta = (h: (typeof vivas)[number]) => {
    const e = estado[h.promocion.id] ?? { promocion: h.promocion, fase: 'quieta' as Fase, mensaje: null }
    const p = e.promocion
    const reintentar = ultima.current[p.id]
    // En un lote de textos todas son de la misma marca: la pieza se llama "Texto N".
    const nombre = esTextos ? `Texto ${p.variante ?? ''}`.trim() : h.marca.nombre
    return (
      <li key={p.id} className="space-y-2 rounded-lg border border-(--color-borde) p-3">
        {h.miniatura ? <img src={h.miniatura} alt={`Miniatura de ${nombre}`} loading="lazy" className="w-full rounded-md" /> : <div className="aspect-[4/5] rounded-md border border-dashed border-(--color-borde)" aria-hidden />}
        <p className="font-semibold">{nombre}</p>
        {esTextos && <EdicionTexto promocion={p} puede={puedeEditar} alGuardar={(np) => poner(p.id, { promocion: np })} {...(esperaGuardadoMs !== undefined ? { esperaGuardadoMs } : {})} />}
        <p className="text-xs text-(--color-tenue)">
          {p.estado === 'aprobada' ? 'Aprobada' : p.estado === 'descartada' ? 'Descartada' : estaLista(p) ? 'Lista para aprobar' : `Falta: ${faltaDe(p, h.textos !== null).join(', ')}`}
        </p>
        {p.estado === 'borrador' && h.textos && (
          <TextoDePieza opciones={h.textos.opciones} elegido={p.copy} desactualizado={h.textos.desactualizado} puede={puede} alElegir={(n) => void elegirTexto(p, n)} />
        )}
        {e.fase === 'trabajando' && <p role="status" className="text-xs text-(--color-tenue)">Trabajando…</p>}
        {e.fase === 'error' && (
          <div role="alert" className="space-y-1 rounded-md border border-(--color-falta) px-2 py-1.5 text-xs">
            <p>{e.mensaje}</p>
            {reintentar && puede && (
              <button type="button" className={boton} onClick={() => void lote([p], reintentar, () => 'Reintento hecho')}>
                Reintentar
              </button>
            )}
          </div>
        )}
        <Link href={`/promocionar/${p.id}?paso=${p.pasoActual}`} className={`${boton} inline-block`}>
          {p.estado === 'borrador' ? 'Ajustar esta pieza' : 'Abrir'}
        </Link>
      </li>
    )
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-(--color-tenue)">
        {rotulo} · {aprobadas.length} de {ps.length} aprobadas
      </p>

      {puedeEditar && n > 0 && (
        <p role="status" aria-label="Lo que sigue" className="rounded-md border border-(--color-borde) px-3 py-2 text-sm">
          <span className="font-medium">Lo que sigue: </span>
          {siguiente}
        </p>
      )}

      {puedeEditar && n > 0 && (
        <section aria-label="Acciones en lote" className="space-y-6 rounded-lg border border-(--color-borde) px-4 py-4">
          <h2 className={titulo}>En lote</h2>
          {sinAsistente && <Estado>{sinAsistente}</Estado>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={boton} disabled={!puede || !habilitado} onClick={() => void analizar()}>
              Analizar las {n} · {formatearCostoLote(costoAntecedentesUsd, n)}
            </button>
            <button type="button" className={boton} disabled={!puede || !habilitado} onClick={() => void escribir()}>
              Escribir textos de las {n} · {formatearCostoLote(costoTextosUsd, n)}
            </button>
          </div>

          <fieldset disabled={!puede} className="min-w-0 space-y-4">
            <legend className="text-sm font-medium">Diseño, fondo y texto para todas</legend>
            <div role="radiogroup" aria-label="Estilo" className="grid gap-2 sm:grid-cols-2">
              {ESTILOS_PLACA.map((id) => (
                <label key={id} className={tarjetaOpcion}>
                  <input type="radio" name="tanda-estilo" checked={estilo === id} onChange={() => setEstilo(id)} className="mt-1" />
                  <span className="font-medium">{ESTILOS[id].nombre}</span>
                </label>
              ))}
            </div>
            <div role="radiogroup" aria-label="Dónde va el texto" className="grid gap-2 sm:grid-cols-3">
              {POSICIONES_TEXTO.map((id) => (
                <label key={id} className={tarjetaOpcion}>
                  <input
                    type="radio"
                    name="tanda-posicion-texto"
                    checked={posicion === id}
                    onChange={() => {
                      setPosicion(id)
                      if (id === 'costado' && moto === 'centro') setMoto('izquierda')
                    }}
                    className="mt-1"
                  />
                  <span className="font-medium">{POSICIONES[id].nombre}</span>
                </label>
              ))}
            </div>
            <div role="radiogroup" aria-label="Dónde va la moto" className="grid gap-2 sm:grid-cols-3">
              {POSICIONES_MOTO.map((id) => (
                <label key={id} className={tarjetaOpcion}>
                  <input type="radio" name="tanda-posicion-moto" checked={motoFinal === id} disabled={id === 'centro' && posicion === 'costado'} onChange={() => setMoto(id)} className="mt-1" />
                  <span className="font-medium">{NOMBRE_MOTO[id]}</span>
                </label>
              ))}
            </div>
            {posicion === 'costado' && <p className="text-xs text-(--color-tenue)">Con el texto al costado, el texto va del lado opuesto a la moto: elegí izquierda o derecha.</p>}
            <OpcionesImagen
              opciones={opciones}
              fondo={fondo}
              onFondo={setFondo}
              descripcion={descripcion}
              onDescripcion={escribirDescripcion}
              inspiracion={inspiracion ? { id: inspiracion.id, url: inspiracion.url, borrada: false } : null}
              onInspiracion={(f) => setInspiracion(f === null ? null : { id: f.id, url: f.url })}
              {...(comprimirFoto ? { comprimirFoto } : {})}
              motor={motor}
              onMotor={setMotor}
              cantidad={cantidad}
              onCantidad={setCantidad}
              puede={puede}
              ocupado={false}
              extras={
                <div className="space-y-1">
                  <label htmlFor="tanda-extra" className="text-sm font-medium">
                    Línea extra (opcional)
                  </label>
                  <input
                    id="tanda-extra"
                    className={campo}
                    value={lineaExtra}
                    maxLength={limites.extra}
                    placeholder="Ej.: Hot Sale · Solo este fin de semana"
                    onChange={(e) => setLineaExtra(e.target.value)}
                  />
                  <p className="text-xs text-(--color-tenue) tabular-nums">
                    {lineaExtra.length}/{limites.extra} · Va en todas las placas. El único precio es el que cargaste en cada una.
                  </p>
                  {extraConEmoji && <p className="text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
                </div>
              }
            />

            <button type="button" className={boton} disabled={extraConEmoji} onClick={() => void aplicarDiseno()}>
              Aplicar a las {n}
            </button>
            {sinAplicar && (
              <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
                Hay cambios sin aplicar: se aplican solos a las {n} (es gratis) al tocar "Ver precio", o apretá "Aplicar a las {n}".
              </p>
            )}
          </fieldset>

          {esMotos ? (
            <ImagenesLote
              tanda={tanda}
              puede={puede}
              listo={listoParaEstimar && !faltaFondo && !extraConEmoji && (difieren === null || sinAplicar)}
              aviso={
                difieren && !sinAplicar
                  ? `En una moto, las marcas tienen que pedir la misma imagen. Difiere: ${difieren}. Aplicá lo mismo a todas.`
                  : faltaFondo
                    ? MENSAJE_FALTA_DESCRIPCION
                    : !listoParaEstimar
                      ? 'Primero elegí el diseño y el fondo.'
                      : null
              }
              apagado={apagado}
              topeUsd={topeUsd}
              motor={motor}
              prepararse={async () => (sinAplicar ? (await aplicarDiseno()) === 0 : true)}
              usarImagen={usarImagenEnMoto}
            />
          ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Imagen compartida</h3>
            <p className="text-xs text-(--color-tenue)">{esTextos ? `Se genera UNA imagen para los ${n} textos y cada placa lleva su texto: se paga una sola vez.` : `Se genera UNA imagen para las ${n} y la marca va en el texto de cada placa: se paga una sola vez.`} Ver precio no cuesta nada.</p>
            {difieren && !sinAplicar && <Estado>{`Para una sola imagen tienen que coincidir la foto, el formato, dónde va el texto, el fondo, la descripción, dónde va la moto y la foto de inspiración. Difiere: ${difieren}. Aplicá lo mismo a todas.`}</Estado>}
            <CompuertaImagen
              apagado={apagado}
              puedeEditar={puede}
              deshabilitado={(difieren !== null && !sinAplicar) || !listoParaEstimar || faltaFondo || extraConEmoji}
              antes={aplicarAntes}
              seVaAPedir={listoParaEstimar && esFondo(fondo) ? { fondo, descripcion: descLote, conInspiracion: inspiracion !== null, posicionMoto: motoFinal } : null}
              topeUsd={topeUsd}
              gastadoUsd={tanda.gastadoUsd}
              explicacion="Ver precio no cuesta nada."
              despuesDeListo="Elegí una imagen abajo."
              pedir={() => postEstimacionTanda({ tandaId: tanda.tanda.id, motor, cantidad })}
              desglose={(d) =>
                `${d.cantidad} imágenes para ${d.promociones ?? n} promociones: ${formatearUsd(d.costoEstimadoUsd)} en total. Una imagen por ${esTextos ? 'texto' : 'marca'} serían ${formatearUsd(d.costoEstimadoUsd * (d.promociones ?? n))}.`
              }
            >
              {!listoParaEstimar && !difieren && <p className="text-xs text-(--color-tenue)">Primero elegí el diseño y el fondo.</p>}
              {faltaFondo && <p className="text-xs text-(--color-falta)">{MENSAJE_FALTA_DESCRIPCION}</p>}
            </CompuertaImagen>

            <VersionesImagen
              versiones={versionesDeImagen(tanda.escenas.map((e) => e.generacion), creativos)}
              alt={(_c, i) => `Imagen compartida ${i + 1}`}
              puedeEditar={puede}
              usar={{ modo: 'accion', etiqueta: `Usar esta imagen en las ${n}`, alUsar: (id) => void usarImagen(id), bloqueado: !puede, dato: (c) => `En uso en ${(c as { usadaEn?: number }).usadaEn ?? 0} de ${ps.length}` }}
              vacio=""
              accionesDe={(c) =>
                c.url && borradores[0] ? (
                  <PedirCambioImagen creativoId={c.id} promocionId={borradores[0].id} puedeEditar={puede} apagado={apagado} topeUsd={topeUsd} gastadoUsd={tanda.gastadoUsd} />
                ) : null
              }
            />
          </div>

          )}

          <div className="space-y-2">
            <button type="button" className={botonPrincipal} disabled={!puede || listas.length === 0} onClick={() => void aprobarTodas()}>
              Aprobar todas las listas ({listas.length})
            </button>
            <p className="text-xs text-(--color-tenue)">Solo las que ya tienen texto, imagen y diseño. Aprobar es gratis.</p>
          </div>
          {corriendo && <p role="status" className="text-sm text-(--color-tenue)">Trabajando… las promociones se van completando de a {CONCURRENCIA}.</p>}
          {resumen && <p role="status" className="text-sm font-medium">{resumen}</p>}
        </section>
      )}

      <section aria-label="Piezas">
        <h2 className={titulo}>Piezas</h2>
        {puede && sinTextoElegido.length > 0 && (
          <div className="mb-3 space-y-1">
            <button type="button" className={boton} onClick={() => void usarOpcionUno()}>
              Usar la opción 1 en todas ({sinTextoElegido.length})
            </button>
            <p className="text-xs text-(--color-tenue)">Elige el primer texto de cada pieza que todavía no tiene uno. Es gratis; después podés cambiar cualquiera.</p>
          </div>
        )}
        {esMotos ? (
          <div className="space-y-6">
            {tanda.grupos.map((g) => (
              <div key={g.grupo ?? 0} role="group" aria-label={`Moto ${g.grupo} · ${g.modelo}`} className="space-y-2">
                <h3 className="text-sm font-medium">
                  Moto {g.grupo} · {g.modelo}
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{vivas.filter((h) => g.hijaIds.includes(h.promocion.id)).map(tarjeta)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{vivas.map(tarjeta)}</ul>
        )}
      </section>
    </div>
  )
}
