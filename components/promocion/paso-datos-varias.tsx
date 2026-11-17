'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MARCAS } from '@/lib/datos/marcas'
import { ASPECTOS_FOTO, type AspectoFoto } from '@/lib/productor/ediciones'
import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { LIMITES_VARIAS } from '@/lib/promocion/varias/tipos'
import { postPromocion } from './api'
import { BarraAccion } from '@/components/ui/barra-accion'
import { Alerta, boton, botonPrincipal, campo, tarjetaOpcion, TituloPaso } from './ui'
import { usarSubidaLote } from './subida-lote'
import { FilaMoto, montoDe, motoCompleta, motoNueva, type MotoForm } from './fila-moto'

const FORMATOS: Record<AspectoFoto, string> = { '1:1': 'Cuadrado 1:1 · feed', '4:5': 'Vertical 4:5 · feed', '9:16': 'Historia 9:16' }

/**
 * Paso 1 de una placa de VARIAS MOTOS (ADR-041) · ¿Qué motos van en la placa? De 2 a 4 motos de una sola marca, cada una con su foto, su modelo, su
 * precio y su promo; el formato y el lugar son comunes. Las fotos se suben al elegirlas (como en el lote de motos) y Crear se habilita cuando están
 * todas arriba. Crear no cuesta nada: arma UNA promoción (la moto 1 es la principal y las otras van en `motos`); la imagen se pide después, en el paso 4.
 */
export function PasoDatosVarias({ puedeEditar, comprimirFoto }: { puedeEditar: boolean; comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion> }) {
  const router = useRouter()
  const contador = useRef(LIMITES_VARIAS.MOTOS_MIN)
  const [motos, setMotos] = useState<MotoForm[]>([motoNueva(1), motoNueva(2)])
  const [marcaId, setMarcaId] = useState('')
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [lugar, setLugar] = useState('Quilmes')
  const [indicaciones, setIndicaciones] = useState('')
  const [derechos, setDerechos] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const enCurso = useRef(false)
  const subida = usarSubidaLote({ derechos, ...(comprimirFoto ? { comprimirFoto } : {}) })

  const fotosListas = subida.listas(motos.map((m) => m.clave))
  const listo = marcaId !== '' && motos.every(motoCompleta) && fotosListas
  const cambiar = (clave: string, c: Partial<MotoForm>) => setMotos((l) => l.map((m) => (m.clave === clave ? { ...m, ...c } : m)))

  async function crear() {
    if (enCurso.current || !listo) return
    enCurso.current = true
    setGuardando(true)
    setErrores([])
    const datosDe = (m: MotoForm) => ({ precio: { moneda: m.moneda, monto: montoDe(m)! }, promo: { tipo: m.tipo, detalle: m.detalle.trim() } })
    const [principal, ...otras] = motos as [MotoForm, ...MotoForm[]]
    const r = await postPromocion({
      marcaId,
      modelo: principal.modelo.trim(),
      ...datosDe(principal),
      lugar: lugar.trim(),
      indicaciones: indicaciones.trim(),
      fotoId: subida.filas[principal.clave]!.fotoId!,
      aspecto,
      motos: otras.map((m) => ({ fotoId: subida.filas[m.clave]!.fotoId!, modelo: m.modelo.trim(), ...datosDe(m) })),
    })
    if (!r.ok) {
      enCurso.current = false
      setGuardando(false)
      setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error])
      return
    }
    router.push(`/promocionar/${r.promocion.id}?paso=${r.promocion.pasoActual}`)
  }

  const deshabilitado = !puedeEditar || guardando
  return (
    <section>
      <TituloPaso numero={1} pregunta="¿Qué motos van en la placa?" leyenda="De 2 a 4 motos juntas en una sola imagen, cada una con su foto, su modelo y su precio." />
      <p className="mb-4 text-sm text-(--color-tenue)">
        En el paso 4 elegís cómo sale: con una foto de referencia, la IA copia ese diseño con tus motos (se ve el precio y se confirma antes de gastar); sin referencia, armamos una grilla con tus fotos, que no cuesta nada.
      </p>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <fieldset disabled={deshabilitado} className="min-w-0 space-y-6">
          <div>
            <label htmlFor="varias-marca" className="text-sm font-medium">
              Marca
            </label>
            <select id="varias-marca" className={campo} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
              <option value="">Elegí la marca…</option>
              {MARCAS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-(--color-tenue)">Una sola para toda la placa.</p>
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
            <p className="text-xs text-(--color-tenue)">Con 4 motos, el vertical 4:5 y la historia 9:16 les dan más lugar.</p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="varias-lugar" className="text-sm font-medium">
                Lugar
              </label>
              <input id="varias-lugar" className={campo} value={lugar} maxLength={60} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="varias-indicaciones" className="text-sm font-medium">
                Indicaciones para los copies (opcional)
              </label>
              <textarea id="varias-indicaciones" className={campo} rows={2} maxLength={500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={derechos} onChange={(e) => setDerechos(e.target.checked)} className="mt-1" />
            {DECLARACION_DERECHOS_V1.texto}
          </label>
          <p className="-mt-4 text-xs text-(--color-tenue)">Una sola declaración para todas las fotos; las fotos se suben al aceptarla.</p>

          {motos.map((m, i) => (
            <FilaMoto
              key={m.clave}
              n={i + 1}
              m={m}
              derechos={derechos}
              subida={subida}
              puedeQuitar={motos.length > LIMITES_VARIAS.MOTOS_MIN}
              onQuitar={() => {
                subida.quitar(m.clave)
                setMotos((l) => l.filter((x) => x.clave !== m.clave))
              }}
              onCambio={(c) => cambiar(m.clave, c)}
            />
          ))}

          <button type="button" className={boton} disabled={motos.length >= LIMITES_VARIAS.MOTOS_MAX} onClick={() => setMotos((l) => [...l, motoNueva(++contador.current)])}>
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
                {guardando ? 'Creando…' : 'Crear la placa'}
              </button>
            </BarraAccion>
            {!listo && !guardando && <p className="text-xs text-(--color-tenue)">Para crear: la marca, y de cada moto la foto (arriba), el modelo y el precio.</p>}
          </div>
        )}
      </form>
    </section>
  )
}
