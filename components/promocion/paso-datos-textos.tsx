'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import { formatearPrecio, LIMITES_PROMOCION } from '@/lib/promocion/datos'
import { LIMITES_LOTE } from '@/lib/promocion/lote/tipos'
import type { FotoDePromocion } from '@/lib/promocion/pantalla'
import { TIPOS_PROMO, type TipoPromo } from '@/lib/promocion/tipos'
import { SubirFoto } from '@/components/creativos/subir-foto'
import { postLote, type PedidoLoteTextos } from './api'
import { Alerta, boton, botonPrincipal, campo, tarjetaOpcion, TituloPaso } from './ui'

const FORMATOS: Record<AspectoFoto, string> = { '1:1': 'Cuadrado 1:1 · feed', '4:5': 'Vertical 4:5 · feed', '9:16': 'Historia 9:16' }
const PROMOS: Record<TipoPromo, string> = { contado: 'Contado', cuotas: 'Cuotas', credito: 'Crédito', oferta: 'Oferta', ninguna: 'Ninguna' }
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })

type Texto = { clave: string; titular: string; lineaExtra: string; monto: string }
const nuevo = (n: number): Texto => ({ clave: `t${n}`, titular: '', lineaExtra: '', monto: '' })
const entero = (x: string) => (/^\d+$/.test(x) ? Number(x) : null)
const tieneEmoji = (t: string) => /\p{Extended_Pictographic}/u.test(t)

/** Lo que distingue a un texto de otro: si dos coinciden en todo, no hay nada que comparar. */
const huella = (t: Texto) => JSON.stringify([t.titular.trim(), t.lineaExtra.trim(), t.monto.trim()])

/** Por qué un titular no sirve (o null): mismos criterios que el servidor, dichos antes de mandar. */
function falloTitular(t: string): string | null {
  const x = t.trim()
  if (x === '') return null
  if (/\d/.test(x)) return 'El titular no lleva precios ni números: el precio va aparte.'
  if (tieneEmoji(x)) return 'El titular no puede llevar emojis.'
  return null
}

/**
 * Paso 1 de un lote de textos (ADR-032) · ¿Qué textos querés probar? UNA moto con 2 a 5 textos distintos
 * (titular, línea extra y, si querés, otro precio) sobre una sola imagen: cada texto es una placa que se
 * aprueba sola. Crear no cuesta nada.
 */
export function PasoDatosTextos({ fotos, puedeEditar }: { fotos: readonly FotoDePromocion[]; puedeEditar: boolean }) {
  const router = useRouter()
  const contador = useRef(2)
  const [marcaId, setMarcaId] = useState('')
  const [modelo, setModelo] = useState('')
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS')
  const [monto, setMonto] = useState('')
  const [tipo, setTipo] = useState<TipoPromo>('contado')
  const [detalle, setDetalle] = useState('')
  const [lugar, setLugar] = useState('Quilmes')
  const [indicaciones, setIndicaciones] = useState('')
  const [fotoId, setFotoId] = useState('')
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [lista, setLista] = useState<readonly FotoDePromocion[]>(fotos)
  const [textos, setTextos] = useState<Texto[]>([nuevo(1), nuevo(2)])
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const enCurso = useRef(false)

  const montoNumero = entero(monto)
  const montoMal = monto !== '' && montoNumero === null
  const repetido = (() => {
    for (let j = 1; j < textos.length; j++) {
      // Dos textos todavía vacíos no son "iguales": simplemente faltan.
      if (textos[j]!.titular.trim() === '') continue
      const i = textos.findIndex((x) => huella(x) === huella(textos[j]!))
      if (i !== j) return [i + 1, j + 1] as const
    }
    return null
  })()
  const textosBien = textos.every((t) => t.titular.trim() !== '' && falloTitular(t.titular) === null && !tieneEmoji(t.lineaExtra) && (t.monto === '' || (entero(t.monto) ?? 0) > 0))
  const listo = marcaId !== '' && modelo.trim().length >= 2 && (montoNumero ?? 0) > 0 && fotoId !== '' && textosBien && repetido === null
  const cambiar = (clave: string, c: Partial<Texto>) => setTextos((l) => l.map((t) => (t.clave === clave ? { ...t, ...c } : t)))

  async function crear() {
    if (enCurso.current || !listo || montoNumero === null) return
    enCurso.current = true
    setGuardando(true)
    setErrores([])
    const pedido: PedidoLoteTextos = {
      tipo: 'textos',
      marcaIds: [marcaId],
      fotoId,
      modelo: modelo.trim(),
      aspecto,
      lugar: lugar.trim(),
      indicaciones: indicaciones.trim(),
      precio: { moneda, monto: montoNumero },
      promo: { tipo, detalle: detalle.trim() },
      variantes: textos.map((t) => ({
        titular: t.titular.trim(),
        ...(t.lineaExtra.trim() !== '' ? { lineaExtra: t.lineaExtra.trim() } : {}),
        ...(t.monto !== '' ? { precio: { moneda, monto: entero(t.monto)! } } : {}),
      })),
    }
    const r = await postLote(pedido)
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
      <TituloPaso numero={1} pregunta="¿Qué textos querés probar?" leyenda="Una moto, una imagen y de 2 a 5 textos distintos: cada texto es una placa." />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <fieldset disabled={deshabilitado} className="min-w-0 space-y-6">
          <fieldset role="radiogroup" className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Marca</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MARCAS.map((m) => (
                <label key={m.id} className={tarjetaOpcion}>
                  <input type="radio" name="marca" value={m.id} checked={marcaId === m.id} onChange={() => setMarcaId(m.id)} className="mt-1" />
                  <span className="font-medium">{m.nombre}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="textos-modelo" className="text-sm font-medium">
              Modelo
            </label>
            <input id="textos-modelo" className={campo} value={modelo} maxLength={60} placeholder="Ej.: TRK 502" onChange={(e) => setModelo(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div>
                <label htmlFor="textos-moneda" className="text-sm font-medium">
                  Moneda
                </label>
                <select id="textos-moneda" className={campo} value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}>
                  <option value="ARS">Pesos ($)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </div>
              <div>
                <label htmlFor="textos-precio" className="text-sm font-medium">
                  Precio de la moto
                </label>
                <input id="textos-precio" className={campo} inputMode="numeric" autoComplete="off" value={monto} aria-invalid={montoMal} placeholder="4500000" onChange={(e) => setMonto(e.target.value.trim())} />
              </div>
            </div>
            <p className={`text-xs ${montoMal ? 'text-(--color-falta)' : 'text-(--color-tenue)'}`}>
              {montoMal ? 'Escribí solo números, sin puntos ni símbolos: 4500000.' : montoNumero ? `Se va a ver así: ${formatearPrecio({ moneda, monto: montoNumero })}` : 'Escribí solo números, sin puntos.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="textos-promo" className="text-sm font-medium">
                Promoción
              </label>
              <select id="textos-promo" className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPromo)}>
                {TIPOS_PROMO.map((t) => (
                  <option key={t} value={t}>
                    {PROMOS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="textos-detalle" className="text-sm font-medium">
                Detalle de la promoción (opcional)
              </label>
              <input id="textos-detalle" className={campo} value={detalle} maxLength={LIMITES_PROMOCION.DETALLE} placeholder="Ej.: 12 cuotas sin interés" onChange={(e) => setDetalle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="textos-lugar" className="text-sm font-medium">
                Lugar
              </label>
              <input id="textos-lugar" className={campo} value={lugar} maxLength={LIMITES_PROMOCION.LUGAR} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="textos-indicaciones" className="text-sm font-medium">
                Indicaciones para el texto (opcional)
              </label>
              <textarea id="textos-indicaciones" className={campo} rows={2} maxLength={LIMITES_PROMOCION.INDICACIONES} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
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
                <label key={a} className={tarjetaOpcion}>
                  <input type="radio" name="formato" value={a} checked={aspecto === a} onChange={() => setAspecto(a)} className="mt-1" />
                  <span className="font-medium">{FORMATOS[a]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="text-sm">Se van a armar {textos.length} placas: una por texto, sobre una sola imagen.</p>

          {textos.map((t, i) => {
            const n = i + 1
            const mal = falloTitular(t.titular)
            return (
              <fieldset key={t.clave} className="min-w-0 space-y-3 rounded-lg border border-(--color-borde) px-4 py-3" aria-label={`Texto ${n}`}>
                <legend className="px-1 text-sm font-semibold">Texto {n}</legend>
                <div>
                  <label htmlFor={`titular-${t.clave}`} className="text-sm font-medium">
                    Titular
                  </label>
                  <input id={`titular-${t.clave}`} className={campo} value={t.titular} maxLength={LIMITES_PROMOCION.TITULAR} placeholder="Ej.: Salí a la ruta" aria-invalid={mal !== null} onChange={(e) => cambiar(t.clave, { titular: e.target.value })} />
                  {mal && <p className="mt-1 text-xs text-(--color-falta)">{mal}</p>}
                </div>
                <div>
                  <label htmlFor={`extra-${t.clave}`} className="text-sm font-medium">
                    Línea extra (opcional)
                  </label>
                  <input id={`extra-${t.clave}`} className={campo} value={t.lineaExtra} maxLength={LIMITES_PROMOCION.LINEA_EXTRA} placeholder="Ej.: Hot Sale · Solo este fin de semana" onChange={(e) => cambiar(t.clave, { lineaExtra: e.target.value })} />
                  {tieneEmoji(t.lineaExtra) && <p className="mt-1 text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
                </div>
                <div>
                  <label htmlFor={`precio-${t.clave}`} className="text-sm font-medium">
                    Precio propio (opcional)
                  </label>
                  <input id={`precio-${t.clave}`} className={campo} inputMode="numeric" autoComplete="off" value={t.monto} placeholder="Si lo dejás vacío, usa el precio de la moto" onChange={(e) => cambiar(t.clave, { monto: e.target.value.trim() })} />
                </div>
                {textos.length > LIMITES_LOTE.TEXTOS_MIN && (
                  <button type="button" className={boton} onClick={() => setTextos((l) => l.filter((x) => x.clave !== t.clave))}>
                    Quitar el texto {n}
                  </button>
                )}
              </fieldset>
            )
          })}
          {repetido && <p className="text-sm text-(--color-falta)">Los textos {repetido[0]} y {repetido[1]} son iguales: cambiá el titular, la línea extra o el precio.</p>}

          <button type="button" className={boton} disabled={textos.length >= LIMITES_LOTE.TEXTOS} onClick={() => setTextos((l) => [...l, nuevo(++contador.current)])}>
            + Agregar texto
          </button>
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
          </Alerta>
        )}

        {puedeEditar && (
          <button type="submit" className={botonPrincipal} disabled={!listo || guardando}>
            {guardando ? 'Creando…' : `Crear las ${textos.length} placas`}
          </button>
        )}
      </form>
    </section>
  )
}
