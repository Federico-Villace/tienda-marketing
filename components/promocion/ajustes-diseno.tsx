'use client'

import type { ReactNode } from 'react'
import { LIMITES_DISENO, CTAS, type Diseno, type DisenoResuelto } from '@/lib/promocion/diseno/tipos'
import { ACENTOS_DE, acentosDe } from '@/lib/promocion/diseno/paletas'
import type { AvisoLogo } from '@/lib/promocion/logos'
import type { IdPlantillaDiseno } from '@/lib/promocion/tipos'
import { campo, tarjetaOpcion } from './ui'

export type CampoDiseno = 'frase' | 'condicionTexto' | 'condicionDestacado'

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
}) {
  const acentos = acentosDe(plantilla)
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
              <span aria-hidden className="inline-block h-4 w-4 rounded-full border border-(--color-borde)" style={{ backgroundColor: ACENTOS_DE[plantilla][a]!.hex }} />
              <span>{ACENTOS_DE[plantilla][a]!.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {plantilla !== 'editorial' && (
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
