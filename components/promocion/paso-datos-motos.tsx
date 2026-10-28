'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { formatearPrecio } from '@/lib/promocion/datos'
import { LIMITES_LOTE } from '@/lib/promocion/lote/tipos'
import { TIPOS_PROMO, type TipoPromo } from '@/lib/promocion/tipos'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'
import { postLote } from './api'
import { Alerta, boton, botonPrincipal, campo, tarjetaOpcion, TituloPaso } from './ui'
import { usarSubidaLote } from './subida-lote'

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.id, rotulo: m.nombre }))
const FORMATOS: Record<AspectoFoto, string> = { '1:1': 'Cuadrado 1:1 · feed', '4:5': 'Vertical 4:5 · feed', '9:16': 'Historia 9:16' }
const PROMOS: Record<TipoPromo, string> = { contado: 'Contado', cuotas: 'Cuotas', credito: 'Crédito', oferta: 'Oferta', ninguna: 'Ninguna' }

type Moto = { clave: string; modelo: string; moneda: 'ARS' | 'USD'; monto: string; tipo: TipoPromo; detalle: string }
const nueva = (n: number): Moto => ({ clave: `m${n}`, modelo: '', moneda: 'ARS', monto: '', tipo: 'contado', detalle: '' })
const montoDe = (m: Moto) => (/^\d+$/.test(m.monto) ? Number(m.monto) : null)
const completa = (m: Moto) => m.modelo.trim().length >= 2 && (montoDe(m) ?? 0) > 0

/**
 * Paso 1 de un lote de motos (ADR-032) · ¿Qué motos querés promocionar? Cada moto con su foto, su modelo, su
 * precio y su promo; el formato, el lugar y las marcas son comunes. Las fotos se suben al elegirlas (de a 2, con
 * su estado y su reintento) y Crear se habilita cuando están todas arriba. Crear no cuesta nada: arma la tanda.
 */
export function PasoDatosMotos({ puedeEditar, comprimirFoto }: { puedeEditar: boolean; comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion> }) {
  const router = useRouter()
  const contador = useRef(2)
  const [motos, setMotos] = useState<Moto[]>([nueva(1), nueva(2)])
  const [marcaIds, setMarcaIds] = useState<string[]>([])
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [lugar, setLugar] = useState('Quilmes')
  const [indicaciones, setIndicaciones] = useState('')
  const [derechos, setDerechos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const enCurso = useRef(false)
  const subida = usarSubidaLote({ derechos, ...(comprimirFoto ? { comprimirFoto } : {}) })

  const placas = motos.length * marcaIds.length
  const demasiadas = placas > LIMITES_LOTE.PLACAS
  const fotosListas = subida.listas(motos.map((m) => m.clave))
  const listo = marcaIds.length > 0 && !demasiadas && motos.every(completa) && fotosListas
  const cambiar = (clave: string, c: Partial<Moto>) => setMotos((l) => l.map((m) => (m.clave === clave ? { ...m, ...c } : m)))

  async function crear() {
    if (enCurso.current || !listo) return
    enCurso.current = true
    setGuardando(true)
    setErrores([])
    const r = await postLote({
      tipo: 'motos',
      marcaIds,
      aspecto,
      lugar: lugar.trim(),
      indicaciones: indicaciones.trim(),
      motos: motos.map((m) => ({
        fotoId: subida.filas[m.clave]!.fotoId!,
        modelo: m.modelo.trim(),
        precio: { moneda: m.moneda, monto: montoDe(m)! },
        promo: { tipo: m.tipo, detalle: m.detalle.trim() },
      })),
    })
    if (!r.ok) {
      enCurso.current = false
      setGuardando(false)
      setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
      return
    }
    router.push(`/promocionar/tanda/${r.tanda.id}`)
  }

  const deshabilitado = !puedeEditar || guardando
  return (
    <section>
      <TituloPaso numero={1} pregunta="¿Qué motos querés promocionar?" leyenda="Cada moto con su foto y su precio; el diseño es el mismo para todas." />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <fieldset disabled={deshabilitado} className="min-w-0 space-y-6">
          <div className="space-y-1">
            <SeleccionMultiple legend="Marcas" opciones={OPCIONES_MARCAS} valor={marcaIds} onCambio={setMarcaIds} />
            <p className={`text-xs ${demasiadas ? 'text-(--color-falta)' : 'text-(--color-tenue)'}`}>
              {marcaIds.length === 0
                ? 'Elegí al menos una marca.'
                : demasiadas
                  ? `Son ${placas} placas: el máximo por lote es ${LIMITES_LOTE.PLACAS}. Sacá motos o marcas.`
                  : `Se van a armar ${placas} placas: ${motos.length} motos × ${marcaIds.length} ${marcaIds.length === 1 ? 'marca' : 'marcas'}.`}
            </p>
          </div>

          <fieldset role="radiogroup" className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Formato</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ASPECTOS_FOTO) as AspectoFoto[]).map((a) => (
                <label key={a} className={tarjetaOpcion}>
                  <input type="radio" name="formato" value={a} checked={aspecto === a} onChange={() => setAspecto(a)} className="mt-1" />
                  <span className="font-medium">{FORMATOS[a]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="lote-lugar" className="text-sm font-medium">
                Lugar
              </label>
              <input id="lote-lugar" className={campo} value={lugar} maxLength={60} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lote-indicaciones" className="text-sm font-medium">
                Indicaciones para el texto (opcional)
              </label>
              <textarea id="lote-indicaciones" className={campo} rows={2} maxLength={500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
              <p className="mt-1 text-xs text-(--color-tenue)">Valen para todas las motos. El fondo y la foto de inspiración se piden en la tanda.</p>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={derechos} onChange={(e) => setDerechos(e.target.checked)} className="mt-1" />
            {DECLARACION_DERECHOS_V1.texto}
          </label>
          <p className="-mt-4 text-xs text-(--color-tenue)">Una sola declaración para todas las fotos del lote; las fotos se suben al aceptarla.</p>

          {motos.map((m, i) => {
            const n = i + 1
            const f = subida.filas[m.clave]
            const monto = montoDe(m)
            const montoMal = m.monto !== '' && monto === null
            return (
              <fieldset key={m.clave} className="min-w-0 space-y-3 rounded-lg border border-(--color-borde) px-4 py-3" aria-label={`Moto ${n}`}>
                <legend className="px-1 text-sm font-semibold">Moto {n}</legend>
                <div className="space-y-1">
                  <label htmlFor={`foto-${m.clave}`} className="text-sm font-medium">
                    Foto de la moto {n}
                  </label>
                  <input
                    id={`foto-${m.clave}`}
                    type="file"
                    accept="image/*"
                    className="block w-full text-xs"
                    onChange={(e) => {
                      const a = e.target.files?.[0]
                      if (a) subida.elegir(m.clave, a)
                    }}
                  />
                  {f?.vista && <img src={f.vista} alt={`Vista previa de la moto ${n}`} className="mt-1 max-h-24 rounded-md object-cover" />}
                  <p role="status" className="text-xs text-(--color-tenue)">
                    {!f
                      ? 'Elegí la foto de esta moto.'
                      : f.estado === 'lista'
                        ? 'Foto lista'
                        : f.estado === 'error'
                          ? f.error
                          : !derechos
                            ? 'Foto elegida: se sube al aceptar la declaración de derechos.'
                            : 'Subiendo la foto…'}
                  </p>
                  {f?.estado === 'error' && (
                    <button type="button" className={boton} onClick={() => subida.reintentar(m.clave)}>
                      Reintentar la foto
                    </button>
                  )}
                </div>

                <div>
                  <label htmlFor={`modelo-${m.clave}`} className="text-sm font-medium">
                    Modelo
                  </label>
                  <input id={`modelo-${m.clave}`} className={campo} value={m.modelo} maxLength={60} placeholder="Ej.: TRK 502" onChange={(e) => cambiar(m.clave, { modelo: e.target.value })} />
                </div>

                <div className="space-y-1">
                  <div className="grid grid-cols-[7rem_1fr] gap-3">
                    <div>
                      <label htmlFor={`moneda-${m.clave}`} className="text-sm font-medium">
                        Moneda
                      </label>
                      <select id={`moneda-${m.clave}`} className={campo} value={m.moneda} onChange={(e) => cambiar(m.clave, { moneda: e.target.value as 'ARS' | 'USD' })}>
                        <option value="ARS">Pesos ($)</option>
                        <option value="USD">Dólares (US$)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`precio-${m.clave}`} className="text-sm font-medium">
                        Precio
                      </label>
                      <input
                        id={`precio-${m.clave}`}
                        className={campo}
                        inputMode="numeric"
                        autoComplete="off"
                        value={m.monto}
                        aria-invalid={montoMal}
                        placeholder="4500000"
                        onChange={(e) => cambiar(m.clave, { monto: e.target.value.trim() })}
                      />
                    </div>
                  </div>
                  <p className={`text-xs ${montoMal ? 'text-(--color-falta)' : 'text-(--color-tenue)'}`}>
                    {montoMal ? 'Escribí solo números, sin puntos ni símbolos: 4500000.' : monto ? `Se va a ver así: ${formatearPrecio({ moneda: m.moneda, monto })}` : 'Escribí solo números, sin puntos.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`promo-${m.clave}`} className="text-sm font-medium">
                      Promoción
                    </label>
                    <select id={`promo-${m.clave}`} className={campo} value={m.tipo} onChange={(e) => cambiar(m.clave, { tipo: e.target.value as TipoPromo })}>
                      {TIPOS_PROMO.map((t) => (
                        <option key={t} value={t}>
                          {PROMOS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`detalle-${m.clave}`} className="text-sm font-medium">
                      Detalle (opcional)
                    </label>
                    <input id={`detalle-${m.clave}`} className={campo} value={m.detalle} maxLength={80} placeholder="Ej.: 12 cuotas sin interés" onChange={(e) => cambiar(m.clave, { detalle: e.target.value })} />
                  </div>
                </div>

                {motos.length > LIMITES_LOTE.MOTOS_MIN && (
                  <button
                    type="button"
                    className={boton}
                    onClick={() => {
                      subida.quitar(m.clave)
                      setMotos((l) => l.filter((x) => x.clave !== m.clave))
                    }}
                  >
                    Quitar la moto {n}
                  </button>
                )}
              </fieldset>
            )
          })}

          <button
            type="button"
            className={boton}
            disabled={motos.length >= LIMITES_LOTE.MOTOS}
            onClick={() => setMotos((l) => [...l, nueva(++contador.current)])}
          >
            + Agregar moto
          </button>
        </fieldset>

        {errores.length > 0 && (
          <Alerta>
            {errores.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
          </Alerta>
        )}

        {puedeEditar && (
          <div className="space-y-1">
            <button type="submit" className={botonPrincipal} disabled={!listo || guardando}>
              {guardando ? 'Creando…' : `Crear ${placas > 0 && !demasiadas ? `las ${placas} placas` : 'el lote'}`}
            </button>
            {!listo && !guardando && (
              <p className="text-xs text-(--color-tenue)">
                Para crear: una marca, y de cada moto la foto (arriba), el modelo y el precio.
              </p>
            )}
          </div>
        )}
      </form>
    </section>
  )
}
