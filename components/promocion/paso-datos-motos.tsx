'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { LIMITES_LOTE } from '@/lib/promocion/lote/tipos'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'
import { postLote } from './api'
import { BarraAccion } from '@/components/ui/barra-accion'
import { Alerta, boton, botonPrincipal, campo, tarjetaOpcion, TituloPaso } from './ui'
import { usarSubidaLote } from './subida-lote'
import { FilaMoto, montoDe, motoCompleta, motoNueva, type MotoForm } from './fila-moto'

const OPCIONES_MARCAS = MARCAS.map((m) => ({ valor: m.id, rotulo: m.nombre }))
const FORMATOS: Record<AspectoFoto, string> = { '1:1': 'Cuadrado 1:1 · feed', '4:5': 'Vertical 4:5 · feed', '9:16': 'Historia 9:16' }

type Moto = MotoForm
const nueva = motoNueva
const completa = motoCompleta

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
      <TituloPaso numero={1} pregunta="¿Qué motos querés promocionar?" leyenda="Cada moto con su foto y su precio; el diseño es el mismo para todas y cada moto tiene su propia imagen." />
      <p className="mb-4 text-sm text-(--color-tenue)">
        ¿Es la misma moto con distintos precios o promos?{' '}
        <Link href="/promocionar/nueva?que=textos" className="underline">
          Usá «Varios textos para una moto»
        </Link>
        : una sola imagen para todas las placas.
      </p>
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
                Indicaciones para los copies (opcional)
              </label>
              <textarea id="lote-indicaciones" className={campo} rows={2} maxLength={500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
              <p className="mt-1 text-xs text-(--color-tenue)">Valen para todas las motos. El fondo y la foto de inspiración los elegís en el paso siguiente, después de crear las placas.</p>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={derechos} onChange={(e) => setDerechos(e.target.checked)} className="mt-1" />
            {DECLARACION_DERECHOS_V1.texto}
          </label>
          <p className="-mt-4 text-xs text-(--color-tenue)">Una sola declaración para todas las fotos del lote; las fotos se suben al aceptarla.</p>

          {motos.map((m, i) => (
            <FilaMoto
              key={m.clave}
              n={i + 1}
              m={m}
              derechos={derechos}
              subida={subida}
              puedeQuitar={motos.length > LIMITES_LOTE.MOTOS_MIN}
              onQuitar={() => {
                subida.quitar(m.clave)
                setMotos((l) => l.filter((x) => x.clave !== m.clave))
              }}
              onCambio={(c) => cambiar(m.clave, c)}
            />
          ))}

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
            <BarraAccion>
              <button type="submit" className={botonPrincipal} disabled={!listo || guardando}>
                {guardando ? 'Creando…' : `Crear ${placas > 0 && !demasiadas ? `las ${placas} placas` : 'el lote'}`}
              </button>
            </BarraAccion>
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
