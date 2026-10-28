'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { postEstimacionTanda } from '@/components/creativos/api'
import { SubirFoto } from '@/components/creativos/subir-foto'
import { usarCompuerta } from '@/components/creativos/compuerta-cliente'
import { formatearUsd } from '@/lib/estratega/formato'
import { INFO_FONDO } from '@/lib/promocion/fondos'
import { formatearCostoLote } from '@/lib/promocion/costos'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { ESTILOS, limitesTexto, POSICIONES } from '@/lib/promocion/plantillas'
import type { TandaVista } from '@/lib/promocion/tanda/pantalla'
import { esPlantilla, ESTILOS_PLACA, estiloDe, FONDOS, plantillaDe, POSICIONES_MOTO, POSICIONES_TEXTO, posicionTextoDe, type EstiloPlaca, type PosicionMoto, type PosicionTexto, type PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postAntecedentes, postTextos, type Fallo } from './api'
import { enLotes } from './lote'
import { Alerta, boton, botonPrincipal, campo, Estado, tarjetaOpcion } from './ui'

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
  motor,
  periodo,
  comprimirFoto,
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
  const compuerta = usarCompuerta(apagado)

  const ps = vivas.map((h) => estado[h.promocion.id]?.promocion ?? h.promocion)
  const borradores = ps.filter((p) => p.estado === 'borrador')
  const listas = ps.filter(estaLista)
  const aprobadas = ps.filter((p) => p.estado === 'aprobada')
  const puede = puedeEditar && !corriendo
  const n = borradores.length
  const creativos = tanda.escenas.flatMap((e) => e.creativos)
  const modelo = ps[0]?.modelo ?? ''

  function poner(id: string, parcial: Partial<Estadito>) {
    setEstado((e) => ({ ...e, [id]: { ...e[id]!, ...parcial } }))
  }

  /** Corre `op` sobre cada promoción (3 a la vez). Un doble click no lanza dos lotes. */
  async function lote(destino: readonly PromocionVista[], op: Operacion, ok: (cuantas: number) => string) {
    if (enCurso.current || destino.length === 0) return
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
  }

  const analizar = () => lote(borradores, async (p) => postAntecedentes(p.id, periodo).then((r) => (r.ok ? { ok: true as const, promocion: r.promocion } : r)), (k) => `${plural(k, 'análisis hecho', 'análisis hechos')}`)
  const escribir = () => lote(borradores, async (p) => postTextos(p.id, { revision: p.revision }).then((r) => (r.ok ? { ok: true as const, promocion: r.promocion } : r)), (k) => `${plural(k, 'texto escrito', 'textos escritos')}`)
  const limites = limitesTexto(posicion)
  const extraConEmoji = /\p{Extended_Pictographic}/u.test(lineaExtra)
  // Al costado la moto no puede quedar al centro (el texto va del lado opuesto): se resuelve acá, antes de mandar.
  const motoFinal: PosicionMoto = posicion === 'costado' && moto === 'centro' ? 'izquierda' : moto
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
  const aprobarTodas = () => lote(listas, (p) => patchPromocion(p.id, { revision: p.revision, accion: 'aprobar' }), (k) => plural(k, 'aprobada', 'aprobadas'))

  const sinAsistente = !habilitado ? 'Esta función está apagada en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema.' : null
  const difieren = !tanda.comparten.ok ? tanda.comparten.difieren.join(', ') : null
  const listoParaEstimar = n > 0 && borradores.every((p) => p.plantilla !== null && p.fondo !== null)
  const est = compuerta.estimacion

  return (
    <div className="space-y-8">
      <p className="text-sm text-(--color-tenue)">
        {modelo} · {plural(ps.length, 'marca', 'marcas')} · {aprobadas.length} de {ps.length} aprobadas
      </p>

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
            <div role="radiogroup" aria-label="Fondo" className="grid gap-2 sm:grid-cols-3">
              {FONDOS.map((f) => (
                <label key={f} className={tarjetaOpcion}>
                  <input type="radio" name="tanda-fondo" checked={fondo === f} onChange={() => setFondo(f)} className="mt-1" />
                  <span className="font-medium">{INFO_FONDO[f].nombre}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <label htmlFor="tanda-descripcion" className="text-sm font-medium">
                Descripción del fondo (opcional)
              </label>
              <textarea
                id="tanda-descripcion"
                className={campo}
                rows={2}
                maxLength={300}
                value={descripcion}
                placeholder="Ej.: una calle de noche con luces cálidas y el cielo despejado"
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <p className="text-xs text-(--color-tenue) tabular-nums">{descripcion.length}/300 · La moto no se modifica: esto solo describe el fondo.</p>
            </div>

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

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Foto de inspiración (opcional)</h4>
              <p className="text-xs text-(--color-tenue)">Una imagen de referencia para copiar el estilo, la luz y el ambiente; la moto es siempre la de tu foto.</p>
              {inspiracion ? (
                <div className="flex items-start gap-3">
                  {inspiracion.url ? <img src={inspiracion.url} alt="Foto de inspiración" loading="lazy" className="max-h-32 rounded-md border border-(--color-borde)" /> : <p className="text-sm">Foto de inspiración lista.</p>}
                  <button type="button" className={boton} onClick={() => setInspiracion(null)}>
                    Quitar la foto de inspiración
                  </button>
                </div>
              ) : (
                <SubirFoto puedeEditar uso="inspiracion" {...(comprimirFoto ? { comprimirFoto } : {})} alSubir={(foto) => setInspiracion({ id: foto.id, url: foto.url })} />
              )}
              <p className="text-xs text-(--color-tenue)">Se aplica a todas al tocar "Aplicar". Suma una imagen de entrada al precio de la imagen compartida.</p>
            </div>

            <button type="button" className={boton} disabled={extraConEmoji} onClick={() => void aplicarDiseno()}>
              Aplicar a las {n}
            </button>
          </fieldset>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Imagen compartida</h3>
            <p className="text-xs text-(--color-tenue)">Se genera UNA imagen para las {n} y la marca va en el texto de cada placa: se paga una sola vez. Ver precio no cuesta nada.</p>
            {apagado && <Estado>{apagado}</Estado>}
            {difieren && <Estado>{`Para una sola imagen tienen que coincidir la foto, el formato, dónde va el texto, el fondo, la descripción, dónde va la moto y la foto de inspiración. Difiere: ${difieren}. Aplicá lo mismo a todas.`}</Estado>}
            {!listoParaEstimar && !difieren && <p className="text-xs text-(--color-tenue)">Primero elegí el diseño y el fondo.</p>}
            <button
              type="button"
              className={boton}
              disabled={!puede || apagado !== null || difieren !== null || !listoParaEstimar || compuerta.fase !== 'libre'}
              onClick={() => void compuerta.pedirEstimacion(() => postEstimacionTanda({ tandaId: tanda.tanda.id, motor, cantidad: VARIANTES }))}
            >
              Ver precio
            </button>
            {est && (
              <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
                <p className="text-sm">
                  {est.datos.cantidad} imágenes para {est.datos.promociones ?? n} promociones: {formatearUsd(est.datos.costoEstimadoUsd)} en total. Una imagen por marca serían {formatearUsd(est.datos.costoEstimadoUsd * (est.datos.promociones ?? n))}.
                </p>
                {est.datos.conInspiracion && <p className="text-xs text-(--color-tenue)">Incluye la foto de inspiración.</p>}
                {topeUsd !== null && <p className="text-xs text-(--color-tenue)">Este mes ya se gastaron {formatearUsd(tanda.gastadoUsd)} de {formatearUsd(topeUsd)}.</p>}
                {est.excede && <p className="text-sm text-(--color-falta)">Esta generación supera lo que queda del tope mensual: no se puede confirmar.</p>}
                <button type="button" className={botonPrincipal} disabled={compuerta.fase !== 'libre' || est.excede || est.bloqueada} onClick={() => void compuerta.confirmar()}>
                  {compuerta.fase === 'corriendo' ? 'Generando… hasta 2 min' : `Confirmar ${formatearUsd(est.datos.costoEstimadoUsd)}`}
                </button>
                {compuerta.fase !== 'corriendo' && <p className="text-xs text-(--color-tenue)">Recién acá se cobra. La estimación vence en 15 minutos.</p>}
              </div>
            )}
            {compuerta.costoReal !== null && <p role="status" className="text-sm">Listo. Costo real: {formatearUsd(compuerta.costoReal)}. Elegí una imagen abajo.</p>}
            {compuerta.error && <Alerta>{compuerta.error}</Alerta>}

            {creativos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {creativos.map((c, i) =>
                  c.url ? (
                    <figure key={c.id} className="space-y-1 rounded-lg border border-(--color-borde) p-2">
                      <img src={c.url} alt={`Imagen compartida ${i + 1}`} loading="lazy" className="w-full rounded-md" />
                      <figcaption className="text-xs text-(--color-tenue)">En uso en {c.usadaEn} de {ps.length}</figcaption>
                      <button type="button" className={boton} disabled={!puede} onClick={() => void usarImagen(c.id)}>
                        Usar esta imagen en las {n}
                      </button>
                    </figure>
                  ) : (
                    <p key={c.id} className="rounded-lg border border-(--color-borde) px-3 py-2 text-xs text-(--color-tenue)">
                      {c.error ?? 'Esta imagen no se pudo generar.'}
                    </p>
                  ),
                )}
              </div>
            )}
          </div>

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
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vivas.map((h) => {
            const e = estado[h.promocion.id] ?? { promocion: h.promocion, fase: 'quieta' as Fase, mensaje: null }
            const p = e.promocion
            const reintentar = ultima.current[p.id]
            return (
              <li key={p.id} className="space-y-2 rounded-lg border border-(--color-borde) p-3">
                {h.miniatura ? <img src={h.miniatura} alt={`Miniatura de ${h.marca.nombre}`} loading="lazy" className="w-full rounded-md" /> : <div className="aspect-[4/5] rounded-md border border-dashed border-(--color-borde)" aria-hidden />}
                <p className="font-semibold">{h.marca.nombre}</p>
                <p className="text-xs text-(--color-tenue)">
                  {p.estado === 'aprobada' ? 'Aprobada' : estaLista(p) ? 'Lista para aprobar' : `Paso ${p.pasoActual} de 6`}
                </p>
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
                  Abrir
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
