'use client'

import { useState, type ReactNode } from 'react'
import { LIMITES_DISENO, CTAS, INCLINACIONES, INCLINACION_POR_DEFECTO, VARIACIONES_POR_PLANTILLA, type Diseno, type DisenoResuelto } from '@/lib/promocion/diseno/tipos'
import { FUENTES_POR_ROL, REGISTRO_FUENTES, type IdFuente, type RolTexto } from '@/lib/promocion/fuentes-placa'
import { ACENTOS_DE, acentosDe } from '@/lib/promocion/diseno/paletas'
import type { AvisoLogo } from '@/lib/promocion/logos'
import type { IdPlantillaDiseno } from '@/lib/promocion/tipos'
import { useContextoDiseno } from './contexto-diseno'
import { boton, campo, tarjetaOpcion } from './ui'

export type CampoDiseno = 'frase' | 'condicionTexto' | 'condicionDestacado'

const ROLES: readonly { rol: RolTexto; nombre: string; de: string }[] = [
  { rol: 'modelo', nombre: 'Modelo', de: 'del modelo' },
  { rol: 'frase', nombre: 'Frase', de: 'de la frase' },
  { rol: 'precio', nombre: 'Precio', de: 'del precio' },
]
const NOMBRE_INCLINACION = (g: number) => (g === 0 ? 'Recto' : g > 0 ? `+${g}°` : `${g}°`)

const PASOS = [-2, -1, 0, 1, 2] as const
const NOMBRE_PASO: Record<number, string> = { [-2]: 'Mucho más chico', [-1]: 'Más chico', 0: 'Automático', 1: 'Más grande', 2: 'Mucho más grande' }

/**
 * "Textos y ajustes" de una plantilla de diseño. Nada de lo que se toca acá cuesta plata: cambia lo que dibuja la
 * placa (gratis), no la imagen que generó la IA. Los textos se guardan solos al dejar de escribir (igual que el
 * titular) y el resto de los controles guardan al instante.
 */
export function AjustesDiseno({
  plantilla,
  resuelto,
  valores,
  onEscribir,
  onBlur,
  indicador,
  onCambiar,
  deshabilitado,
  logosMarca,
  avisosLogo,
  guardado = null,
  acentoOriginal,
  inclinacionDeFabrica,
}: {
  plantilla: IdPlantillaDiseno
  resuelto: DisenoResuelto
  valores: Record<CampoDiseno, string>
  onEscribir: (c: CampoDiseno, x: string) => void
  onBlur: () => void
  indicador: (c: CampoDiseno) => ReactNode
  /** Un control que guarda al instante: manda SOLO lo que cambió (el padre lo une con lo guardado). */
  onCambiar: (cambio: Diseno) => void
  deshabilitado: boolean
  /** Los logos de marca de moto de la concesionaria (Vespa, Guzzi…), si tiene. */
  logosMarca: readonly { id: string }[]
  avisosLogo: readonly AvisoLogo[]
  /** Lo que hay guardado en promociones.diseno (sin completar): fuentes e inclinación se guardan como objeto, y "Original" quita la clave. */
  guardado?: Diseno | null
  /** Solo la plantilla 'referencia': el color del acento leído de la foto (el de la muestra "Original"). */
  acentoOriginal?: string
  /** Solo la plantilla 'referencia': la inclinación de fábrica de cada texto es la que se leyó de la foto. */
  inclinacionDeFabrica?: Record<RolTexto, number>
}) {
  const { familias } = useContextoDiseno()
  const [abierta, setAbierta] = useState<RolTexto | null>(null)
  const cuantas = VARIACIONES_POR_PLANTILLA[plantilla]
  const elegirFuente = (rol: RolTexto, id: IdFuente) => {
    setAbierta(null)
    if (id !== resuelto.fuentes[rol]) onCambiar({ fuentes: { ...guardado?.fuentes, [rol]: id } })
  }
  const elegirInclinacion = (rol: RolTexto, g: number | 'original') => {
    const resto = { ...guardado?.inclinacion }
    delete resto[rol]
    onCambiar({ inclinacion: g === 'original' ? resto : { ...resto, [rol]: g as (typeof INCLINACIONES)[number] } })
  }
  const acentos = acentosDe(plantilla)
  // Número y lista (solo editorial): se escriben libres y se guardan al salir del campo.
  const [numero, setNumero] = useState(resuelto.numero)
  const [lista, setLista] = useState(resuelto.lista.join(', '))
  const guardarNumero = () => {
    const n = numero.trim()
    if (n !== resuelto.numero) onCambiar({ numero: n })
  }
  const guardarLista = () => {
    const items = lista.split(',').map((x) => x.trim()).filter(Boolean)
    if (items.join('|') !== resuelto.lista.join('|')) onCambiar({ lista: items })
  }
  const tamano = (k: 'modelo' | 'frase' | 'precio', etiqueta: string) => (
    <label className="block text-sm">
      {etiqueta}
      <select className={campo} disabled={deshabilitado} value={resuelto.tamanos[k]} onChange={(e) => onCambiar({ tamanos: { ...resuelto.tamanos, [k]: Number(e.target.value) } })}>
        {PASOS.map((n) => (
          <option key={n} value={n}>
            {NOMBRE_PASO[n]}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-4 rounded-lg border border-(--color-borde) px-4 py-3" data-testid="ajustes-diseno">
      <div>
        <h3 className="text-sm font-semibold">Textos y ajustes</h3>
        <p className="text-xs text-(--color-tenue)">Todo esto es gratis: cambia cómo se arma la placa, no la imagen que generó la IA.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="diseno-frase" className="text-sm font-medium">
          Frase
        </label>
        <input id="diseno-frase" className={campo} value={valores.frase} maxLength={LIMITES_DISENO.FRASE} disabled={deshabilitado} onChange={(e) => onEscribir('frase', e.target.value)} onBlur={onBlur} />
        <p className="text-xs text-(--color-tenue) tabular-nums">{valores.frase.length}/{LIMITES_DISENO.FRASE} · Sin montos: el precio va aparte.</p>
        {indicador('frase')}
      </div>

      <fieldset className="min-w-0 space-y-1" disabled={deshabilitado}>
        <legend className="text-sm font-medium">Condición (ej.: 12 CUOTAS · SIN INTERÉS)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="diseno-condicion-texto" className="text-xs text-(--color-tenue)">
              Texto
            </label>
            <input id="diseno-condicion-texto" className={campo} value={valores.condicionTexto} maxLength={LIMITES_DISENO.CONDICION_TEXTO} onChange={(e) => onEscribir('condicionTexto', e.target.value)} onBlur={onBlur} />
          </div>
          <div>
            <label htmlFor="diseno-condicion-destacado" className="text-xs text-(--color-tenue)">
              Destacado
            </label>
            <input id="diseno-condicion-destacado" className={campo} value={valores.condicionDestacado} maxLength={LIMITES_DISENO.CONDICION_DESTACADO} onChange={(e) => onEscribir('condicionDestacado', e.target.value)} onBlur={onBlur} />
          </div>
        </div>
        {indicador('condicionTexto')}
      </fieldset>

      {plantilla === 'editorial' && (
        <>
          <div className="space-y-1">
            <label htmlFor="diseno-numero" className="text-sm font-medium">
              Número grande (hasta {LIMITES_DISENO.NUMERO})
            </label>
            <input id="diseno-numero" className={campo} value={numero} maxLength={LIMITES_DISENO.NUMERO} disabled={deshabilitado} onChange={(e) => setNumero(e.target.value)} onBlur={guardarNumero} />
            <p className="text-xs text-(--color-tenue)">Por defecto sale del modelo (TRK 251 → 251).</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="diseno-lista" className="text-sm font-medium">
              Lista lateral (hasta {LIMITES_DISENO.LISTA_ITEMS} palabras, separadas por coma)
            </label>
            <input id="diseno-lista" className={campo} value={lista} disabled={deshabilitado} placeholder="ABS, Bluetooth, Cardán" onChange={(e) => setLista(e.target.value)} onBlur={guardarLista} />
          </div>
        </>
      )}

      <label className="block text-sm font-medium">
        Llamado a la acción
        <select className={campo} disabled={deshabilitado} value={resuelto.cta} onChange={(e) => onCambiar({ cta: e.target.value as Diseno['cta'] })}>
          {CTAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className={`${tarjetaOpcion} items-center`}>
        <input type="checkbox" checked={resuelto.mostrarPrecio} disabled={deshabilitado} onChange={(e) => onCambiar({ mostrarPrecio: e.target.checked })} />
        <span>Mostrar el precio en la imagen (si no, dice “Consultá precio”)</span>
      </label>

      <fieldset role="radiogroup" aria-label="Color de acento" disabled={deshabilitado} className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Color de acento</legend>
        <div className="flex flex-wrap gap-2">
          {acentos.map((a) => (
            <label key={a} className={`${tarjetaOpcion} items-center`}>
              <input type="radio" name="diseno-acento" checked={resuelto.acento === a} onChange={() => onCambiar({ acento: a })} />
              <span aria-hidden className="inline-block h-4 w-4 rounded-full border border-(--color-borde)" style={{ backgroundColor: a === 'original' && acentoOriginal ? acentoOriginal : ACENTOS_DE[plantilla][a]!.hex }} />
              <span>{ACENTOS_DE[plantilla][a]!.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {plantilla !== 'editorial' && plantilla !== 'referencia' && (
        <fieldset role="radiogroup" aria-label="Dónde va la frase" disabled={deshabilitado} className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">Dónde va la frase</legend>
          <div className="flex flex-wrap gap-2">
            {(['izquierda', 'derecha'] as const).map((p) => (
              <label key={p} className={`${tarjetaOpcion} items-center`}>
                <input type="radio" name="diseno-posicion-frase" checked={resuelto.posicionFrase === p} onChange={() => onCambiar({ posicionFrase: p })} />
                <span>{p === 'izquierda' ? 'A la izquierda' : 'A la derecha'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {tamano('modelo', 'Tamaño del modelo')}
        {tamano('frase', 'Tamaño de la frase')}
        {tamano('precio', 'Tamaño del precio')}
      </div>

      <fieldset className="min-w-0 space-y-3" disabled={deshabilitado} data-testid="letra-y-forma">
        <legend className="text-sm font-medium">Letra, inclinación y distribución</legend>
        {ROLES.map(({ rol, nombre, de }) => {
          const actual = resuelto.fuentes[rol]
          const g = resuelto.inclinacion[rol]
          const deFabrica = inclinacionDeFabrica?.[rol] ?? INCLINACION_POR_DEFECTO[plantilla]![rol]
          const estilo = (id: IdFuente) => ({ fontFamily: familias[id], fontWeight: REGISTRO_FUENTES[id].peso, fontStyle: REGISTRO_FUENTES[id].estilo })
          return (
            <div key={rol} className="space-y-2 rounded-md border border-(--color-borde) p-2" data-testid={`letra-${rol}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{nombre}</span>
                <button type="button" className={`${boton} min-w-0 flex-1 justify-between gap-2 sm:flex-none sm:min-w-48`} aria-expanded={abierta === rol} aria-label={`Fuente ${de}: ${REGISTRO_FUENTES[actual].nombre}`} onClick={() => setAbierta(abierta === rol ? null : rol)}>
                  <span className="truncate text-base" style={estilo(actual)}>{REGISTRO_FUENTES[actual].nombre}</span>
                  <span aria-hidden>▾</span>
                </button>
              </div>
              {abierta === rol && (
                <div role="radiogroup" aria-label={`Fuente ${de}`} className="grid gap-1 sm:grid-cols-2">
                  {FUENTES_POR_ROL[rol].map((id) => (
                    <label key={id} className={`${tarjetaOpcion} items-center`}>
                      <input type="radio" name={`fuente-${rol}`} checked={actual === id} onChange={() => elegirFuente(rol, id)} />
                      <span className="truncate text-lg leading-tight" style={estilo(id)}>{REGISTRO_FUENTES[id].nombre}</span>
                    </label>
                  ))}
                </div>
              )}
              <div role="radiogroup" aria-label={`Inclinación ${de}`} className="grid grid-cols-5 gap-1">
                {INCLINACIONES.map((n) => (
                  <label key={n} className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-(--color-borde) px-1 text-sm has-[:checked]:border-(--color-ok) has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:disabled]:opacity-60">
                    <input type="radio" className="sr-only" name={`inclinacion-${rol}`} checked={g === n} onChange={() => elegirInclinacion(rol, n)} />
                    {NOMBRE_INCLINACION(n)}
                  </label>
                ))}
              </div>
              {deFabrica !== 0 && !(INCLINACIONES as readonly number[]).includes(deFabrica) && (
                <label className={`${tarjetaOpcion} items-center`}>
                  <input type="radio" name={`inclinacion-${rol}`} checked={g === deFabrica} onChange={() => elegirInclinacion(rol, 'original')} />
                  <span>Inclinación original ({deFabrica}°)</span>
                </label>
              )}
            </div>
          )
        })}
        <button type="button" className={`${boton} w-full`} onClick={() => onCambiar({ variacion: (resuelto.variacion + 1) % cuantas })}>
          Otra variación ({resuelto.variacion + 1} de {cuantas})
        </button>
        <p className="text-xs text-(--color-tenue)">{plantilla === 'referencia' ? 'Espeja la distribución de tu referencia (izquierda ↔ derecha). Gratis.' : 'Cambia la distribución de la placa (dónde va cada texto). La moto sigue al centro. Gratis.'}</p>
      </fieldset>

      {logosMarca.length > 0 && (
        <label className="block text-sm font-medium">
          Logo de la marca de la moto
          <select className={campo} disabled={deshabilitado} value={resuelto.logoMarca ?? ''} onChange={(e) => onCambiar({ logoMarca: e.target.value === '' ? null : e.target.value })}>
            <option value="">Ninguno</option>
            {logosMarca.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id}
              </option>
            ))}
          </select>
        </label>
      )}

      {avisosLogo.length > 0 && (
        <ul className="space-y-1 text-xs text-(--color-aviso)" aria-label="Avisos de logos">
          {avisosLogo.map((a, i) => (
            <li key={`${a.codigo}-${i}`}>{a.mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
