'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import { formatearPrecio } from '@/lib/promocion/datos'
import type { FotoDePromocion } from '@/lib/promocion/pantalla'
import { TIPOS_PROMO, type PromocionVista, type TipoPromo } from '@/lib/promocion/tipos'
import { SubirFoto } from '@/components/creativos/subir-foto'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'
import { patchPromocion, postPromocion, postTanda } from './api'
import { Alerta, boton, botonPrincipal, campo, Estado, tarjetaOpcion, TituloPaso } from './ui'

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.id, rotulo: m.nombre }))

const FORMATOS: Record<AspectoFoto, string> = {
  '1:1': 'Cuadrado 1:1 · feed',
  '4:5': 'Vertical 4:5 · feed',
  '9:16': 'Historia 9:16',
}
const PROMOS: Record<TipoPromo, string> = {
  contado: 'Contado',
  cuotas: 'Cuotas',
  credito: 'Crédito',
  oferta: 'Oferta',
  ninguna: 'Ninguna',
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })

function Radio({ nombre, valor, actual, alElegir, children }: { nombre: string; valor: string; actual: string; alElegir: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={tarjetaOpcion}>
      <input type="radio" name={nombre} value={valor} checked={actual === valor} onChange={() => alElegir(valor)} className="mt-1" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

/**
 * Paso 1 · ¿Qué querés promocionar? Marca, modelo, precio, promo, foto y formato.
 * Sirve para crear la promoción y para volver a editarla. El monto se manda como número
 * entero (nunca "4.500.000"): lo que escribís es lo que se dibuja en la imagen.
 */
export function PasoDatos({
  fotos,
  puedeEditar,
  promocion = null,
}: {
  fotos: readonly FotoDePromocion[]
  puedeEditar: boolean
  promocion?: PromocionVista | null
}) {
  const router = useRouter()
  const d = promocion?.datos
  const [marcaId, setMarcaId] = useState(promocion?.marcaId ?? '')
  // Al crear se eligen UNA o varias marcas; al editar, la promoción ya es de una.
  const [marcaIds, setMarcaIds] = useState<string[]>([])
  const [modelo, setModelo] = useState(promocion?.modelo ?? '')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(d?.precio.moneda ?? 'ARS')
  const [monto, setMonto] = useState(d ? String(d.precio.monto) : '')
  const [tipo, setTipo] = useState<TipoPromo>(d?.promo.tipo ?? 'contado')
  const [detalle, setDetalle] = useState(d?.promo.detalle ?? '')
  const [lugar, setLugar] = useState(d?.lugar ?? 'Quilmes')
  const [indicaciones, setIndicaciones] = useState(d?.indicaciones ?? '')
  const [fotoId, setFotoId] = useState(promocion?.fotoId ?? '')
  const [aspecto, setAspecto] = useState<AspectoFoto>(promocion?.aspecto ?? '4:5')
  const [lista, setLista] = useState<readonly FotoDePromocion[]>(fotos)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])
  const [destino, setDestino] = useState<string | null>(null)
  const enCurso = useRef(false)

  const montoNumero = /^\d+$/.test(monto) ? Number(monto) : null
  const montoMal = monto !== '' && montoNumero === null
  const marcaElegida = promocion ? marcaId !== '' : marcaIds.length > 0
  const listo = marcaElegida && modelo.trim().length >= 2 && montoNumero !== null && montoNumero > 0 && fotoId !== ''

  if (promocion && promocion.estado !== 'borrador') {
    return (
      <section>
        <TituloPaso numero={1} pregunta="¿Qué querés promocionar?" leyenda="Lo que cargaste en esta promoción." />
        <Estado>{promocion.estado === 'aprobada' ? 'Está aprobada: para cambiar algo tocá "Volver a editar" en el paso 5.' : 'Esta promoción está descartada.'}</Estado>
      </section>
    )
  }

  async function guardar() {
    if (enCurso.current || !listo || montoNumero === null) return
    enCurso.current = true
    setGuardando(true)
    setErrores([])
    setConflicto(false)
    setAvisos([])
    const datos = { precio: { moneda, monto: montoNumero }, promo: { tipo, detalle: detalle.trim() }, lugar: lugar.trim(), indicaciones: indicaciones.trim() }
    if (!promocion && marcaIds.length >= 2) {
      const t = await postTanda({ marcaIds, modelo: modelo.trim(), ...datos, fotoId, aspecto })
      enCurso.current = false
      setGuardando(false)
      if (!t.ok) {
        setErrores(t.errores && t.errores.length > 0 ? t.errores : [t.error])
        return
      }
      router.push(`/promocionar/tanda/${t.tanda.id}`)
      return
    }
    const r = promocion
      ? await patchPromocion(promocion.id, { revision: promocion.revision, marcaId, modelo: modelo.trim(), datos, fotoId, aspecto })
      : await postPromocion({ marcaId: marcaIds[0]!, modelo: modelo.trim(), ...datos, fotoId, aspecto })
    enCurso.current = false
    setGuardando(false)
    if (!r.ok) {
      setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
      setConflicto(r.status === 409)
      return
    }
    const adonde = `/promocionar/${r.promocion.id}?paso=${r.promocion.pasoActual}`
    if (r.avisos.length > 0) {
      setAvisos(r.avisos)
      setDestino(adonde)
      return
    }
    router.push(adonde)
  }

  const deshabilitado = !puedeEditar || guardando

  return (
    <section>
      <TituloPaso numero={1} pregunta="¿Qué querés promocionar?" leyenda="Contanos la moto, el precio y la promo: con eso armamos el resto." />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <fieldset disabled={deshabilitado} className="min-w-0 space-y-6">
          {promocion ? (
            <fieldset role="radiogroup" className="min-w-0 space-y-2">
              <legend className="mb-1 text-sm font-medium">Marca</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {MARCAS.map((m) => (
                  <Radio key={m.id} nombre="marca" valor={m.id} actual={marcaId} alElegir={setMarcaId}>
                    <span className="font-medium">{m.nombre}</span>
                  </Radio>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="space-y-1">
              <SeleccionMultiple legend="Marcas" opciones={OPCIONES_MARCAS} valor={marcaIds} onCambio={setMarcaIds} />
              <p className="text-xs text-(--color-tenue)">
                {marcaIds.length >= 2 ? `Se van a armar ${marcaIds.length} piezas: una por marca` : 'Elegí una marca, o varias para sacar una pieza por concesionario.'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="promo-modelo" className="text-sm font-medium">
              Modelo
            </label>
            <input id="promo-modelo" className={campo} value={modelo} maxLength={60} placeholder="Ej.: TRK 502" onChange={(e) => setModelo(e.target.value)} />
            <p className="mt-1 text-xs text-(--color-tenue)">Escribilo como lo llama el cliente. Sin emojis.</p>
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div>
                <label htmlFor="promo-moneda" className="text-sm font-medium">
                  Moneda
                </label>
                <select id="promo-moneda" className={campo} value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}>
                  <option value="ARS">Pesos ($)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </div>
              <div>
                <label htmlFor="promo-precio" className="text-sm font-medium">
                  Precio
                </label>
                <input
                  id="promo-precio"
                  className={campo}
                  inputMode="numeric"
                  autoComplete="off"
                  value={monto}
                  aria-invalid={montoMal}
                  aria-describedby="promo-precio-ayuda"
                  placeholder="4500000"
                  onChange={(e) => setMonto(e.target.value.trim())}
                />
              </div>
            </div>
            <p id="promo-precio-ayuda" className={`text-xs ${montoMal ? 'text-(--color-falta)' : 'text-(--color-tenue)'}`}>
              {montoMal ? 'Escribí solo números, sin puntos ni símbolos: 4500000.' : montoNumero ? `Se va a ver así: ${formatearPrecio({ moneda, monto: montoNumero })}` : 'Escribí solo números, sin puntos.'}
            </p>
          </div>

          <fieldset role="radiogroup" className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Promoción</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS_PROMO.map((t) => (
                <Radio key={t} nombre="promo" valor={t} actual={tipo} alElegir={(v) => setTipo(v as TipoPromo)}>
                  <span className="font-medium">{PROMOS[t]}</span>
                </Radio>
              ))}
            </div>
            <label htmlFor="promo-detalle" className="mt-2 block text-sm">
              Detalle de la promoción (opcional)
            </label>
            <input id="promo-detalle" className={campo} value={detalle} maxLength={80} placeholder="Ej.: 12 cuotas sin interés" onChange={(e) => setDetalle(e.target.value)} />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="promo-lugar" className="text-sm font-medium">
                Lugar
              </label>
              <input id="promo-lugar" className={campo} value={lugar} maxLength={60} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="promo-indicaciones" className="text-sm font-medium">
                Indicaciones para el texto (opcional)
              </label>
              <textarea id="promo-indicaciones" className={campo} rows={3} maxLength={500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
              <p className="mt-1 text-xs text-(--color-tenue)">Lo que quieras que tenga en cuenta quien escribe los textos. El fondo y la foto de inspiración se piden en el paso 4.</p>
            </div>
          </div>

          <fieldset role="radiogroup" className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Foto</legend>
            {lista.length === 0 ? (
              <p className="text-sm text-(--color-tenue)">Todavía no subiste ninguna foto. Subí una abajo.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {lista.map((x) => (
                  <label key={x.id} className={`${tarjetaOpcion} flex-col`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="foto" value={x.id} checked={fotoId === x.id} onChange={() => setFotoId(x.id)} />
                      <span className="text-xs">Foto subida el {fecha(x.creadoEn)}</span>
                    </span>
                    {x.url ? <img src={x.url} alt="Miniatura de la moto" loading="lazy" className="w-full rounded-md" /> : <span className="text-xs text-(--color-tenue)">Sin vista previa</span>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset role="radiogroup" className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Formato</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ASPECTOS_FOTO) as AspectoFoto[]).map((a) => (
                <Radio key={a} nombre="formato" valor={a} actual={aspecto} alElegir={(v) => setAspecto(v as AspectoFoto)}>
                  <span className="font-medium">{FORMATOS[a]}</span>
                </Radio>
              ))}
            </div>
          </fieldset>
        </fieldset>

        {puedeEditar && (
          <SubirFoto
            puedeEditar
            alSubir={(f) => {
              setLista((l) => [{ id: f.id, ancho: f.ancho, alto: f.alto, creadoEn: new Date().toISOString(), url: f.url }, ...l])
              setFotoId(f.id)
            }}
          />
        )}

        {errores.length > 0 && (
          <Alerta>
            {errores.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
            {conflicto && (
              <button type="button" className={`${boton} mt-2`} onClick={() => router.refresh()}>
                Recargar
              </button>
            )}
          </Alerta>
        )}
        {avisos.length > 0 && destino && (
          <div className="space-y-2">
            <Estado>{avisos.join(' ')}</Estado>
            <button type="button" className={botonPrincipal} onClick={() => router.push(destino)}>
              Entendido, seguir
            </button>
          </div>
        )}

        {puedeEditar && avisos.length === 0 && (
          <button type="submit" className={botonPrincipal} disabled={!listo || guardando}>
            {guardando ? 'Guardando…' : promocion ? 'Guardar cambios' : 'Seguir · cómo nos fue'}
          </button>
        )}
      </form>
    </section>
  )
}
