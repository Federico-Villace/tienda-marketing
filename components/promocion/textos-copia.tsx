'use client'

import type { ReactNode } from 'react'
import { CTAS, LIMITES_DISENO, type Diseno, type DisenoResuelto } from '@/lib/promocion/diseno/tipos'
import { MostrarTextos } from './mostrar-textos'
import { campo } from './ui'
import type { CampoDiseno } from './ajustes-diseno'

/**
 * "Textos que va a escribir la IA" (ADR-040): lo único que se ajusta en la copia fiel. El modelo, el precio y el lugar salen del paso 1
 * (solo lectura); la frase, la condición y el botón se escriben acá y se guardan solos. Cada casilla de "Mostrar" SACA un elemento de la placa:
 * a la IA se le pide omitirlo de la referencia. Cambiar un texto después de generar obliga a generar otra imagen (la persona lo ve en la pantalla).
 * El lector no ve este panel (lo decide el padre).
 */
export function TextosCopiaFiel({
  resuelto,
  valores,
  onEscribir,
  onBlur,
  indicador,
  onCambiar,
  deshabilitado,
  fijos,
  lineaPedida,
}: {
  resuelto: DisenoResuelto
  valores: Record<CampoDiseno, string>
  onEscribir: (c: CampoDiseno, x: string) => void
  onBlur: () => void
  indicador: (c: CampoDiseno) => ReactNode
  /** Un control que guarda al instante: manda SOLO lo que cambió. */
  onCambiar: (cambio: Diseno) => void
  deshabilitado: boolean
  /** Lo que sale del paso 1 y no se cambia acá. */
  fijos: { modelo: string; precio: string; lugar: string }
  /** La línea tal como se le va a pedir a la IA: "ROUSER 200 · $ 4.500.000 · …". */
  lineaPedida: string
}) {
  const sacado = (o: (typeof resuelto.ocultos)[number]) => resuelto.ocultos.includes(o)
  return (
    <div className="space-y-4 rounded-lg border border-(--color-borde) px-4 py-3" data-testid="textos-copia">
      <div>
        <h3 className="text-sm font-semibold">Textos que va a escribir la IA</h3>
        <p className="text-xs text-(--color-tenue)">La IA los escribe en la imagen y después se revisan solos. Si cambiás uno después de generar, hay que generar otra imagen.</p>
      </div>

      <MostrarTextos ocultos={resuelto.ocultos} onCambiar={(ocultos) => onCambiar({ ocultos })} deshabilitado={deshabilitado} />

      <dl className="grid gap-1 text-sm sm:grid-cols-3">
        {([['Modelo', fijos.modelo, 'modelo'], ['Precio', fijos.precio, 'precio'], ['Lugar', fijos.lugar, 'lugar']] as const).map(([nombre, valor, id]) => (
          <div key={nombre} className={sacado(id) ? 'opacity-50' : ''}>
            <dt className="text-xs text-(--color-tenue)">{nombre}</dt>
            <dd className="font-medium">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-(--color-tenue)">El modelo, el precio y el lugar se cambian en el paso 1.</p>

      <div className="space-y-1">
        <label htmlFor="copia-frase" className="text-sm font-medium">
          Frase
        </label>
        <input id="copia-frase" className={campo} value={valores.frase} maxLength={LIMITES_DISENO.FRASE} disabled={deshabilitado || sacado('frase')} onChange={(e) => onEscribir('frase', e.target.value)} onBlur={onBlur} />
        <p className="text-xs text-(--color-tenue) tabular-nums">{valores.frase.length}/{LIMITES_DISENO.FRASE} · Sin montos: el precio va aparte.</p>
        {indicador('frase')}
      </div>

      <fieldset className="min-w-0 space-y-1" disabled={deshabilitado || sacado('condicion')}>
        <legend className="text-sm font-medium">Condición (ej.: 12 CUOTAS · SIN INTERÉS)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="copia-condicion-texto" className="text-xs text-(--color-tenue)">
              Texto
            </label>
            <input id="copia-condicion-texto" className={campo} value={valores.condicionTexto} maxLength={LIMITES_DISENO.CONDICION_TEXTO} onChange={(e) => onEscribir('condicionTexto', e.target.value)} onBlur={onBlur} />
          </div>
          <div>
            <label htmlFor="copia-condicion-destacado" className="text-xs text-(--color-tenue)">
              Destacado
            </label>
            <input id="copia-condicion-destacado" className={campo} value={valores.condicionDestacado} maxLength={LIMITES_DISENO.CONDICION_DESTACADO} onChange={(e) => onEscribir('condicionDestacado', e.target.value)} onBlur={onBlur} />
          </div>
        </div>
        {indicador('condicionTexto')}
      </fieldset>

      <label className="block text-sm font-medium">
        Botón (llamado a la acción)
        <select className={campo} disabled={deshabilitado || sacado('cta')} value={resuelto.cta} onChange={(e) => onCambiar({ cta: e.target.value as Diseno['cta'] })}>
          {CTAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs" data-testid="linea-pedida">
        <span className="text-(--color-tenue)">Esto es lo que se le pide escribir a la IA: </span>
        {lineaPedida === '' ? <span>nada (la imagen va sin textos)</span> : <span className="font-medium">{lineaPedida}</span>}
      </p>
    </div>
  )
}

/**
 * "Textos que va a escribir la IA" de una placa de VARIAS MOTOS (ADR-041). Cada moto lleva su modelo, su precio y su condición, que salen del
 * paso 1 y no se cambian (para otras motos, otra promoción); acá se escriben la frase y el botón (de toda la placa) y las casillas de "Mostrar"
 * sacan un elemento de TODAS las motos. El lector no ve este panel (lo decide el padre).
 */
export function TextosCopiaFielVarias({
  resuelto,
  motos,
  lugar,
  frase,
  onEscribirFrase,
  onBlur,
  indicador,
  onCambiar,
  deshabilitado,
  lineaPedida,
}: {
  resuelto: DisenoResuelto
  /** Lo que sale del paso 1, ya formateado, la moto 1 primero. */
  motos: readonly { modelo: string; precio: string; condicion: string }[]
  lugar: string
  frase: string
  onEscribirFrase: (x: string) => void
  onBlur: () => void
  indicador: ReactNode
  onCambiar: (cambio: Diseno) => void
  deshabilitado: boolean
  lineaPedida: string
}) {
  const sacado = (o: (typeof resuelto.ocultos)[number]) => resuelto.ocultos.includes(o)
  const atenuar = (o: (typeof resuelto.ocultos)[number]) => (sacado(o) ? 'opacity-50' : '')
  return (
    <div className="space-y-4 rounded-lg border border-(--color-borde) px-4 py-3" data-testid="textos-copia">
      <div>
        <h3 className="text-sm font-semibold">Textos que va a escribir la IA</h3>
        <p className="text-xs text-(--color-tenue)">La IA los escribe en la imagen, cada uno junto a su moto, y después se revisan solos. Si cambiás uno después de generar, hay que generar otra imagen.</p>
      </div>

      <MostrarTextos ocultos={resuelto.ocultos} onCambiar={(ocultos) => onCambiar({ ocultos })} deshabilitado={deshabilitado} />

      <ul aria-label="Motos de la placa" className="space-y-1 text-sm">
        {motos.map((m, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="text-(--color-tenue)">Moto {i + 1}</span>
            <span data-sacado={sacado('modelo') ? 'modelo' : undefined} className={`font-medium ${atenuar('modelo')}`}>{m.modelo}</span>
            <span data-sacado={sacado('precio') ? 'precio' : undefined} className={`tabular-nums ${atenuar('precio')}`}>{m.precio}</span>
            {m.condicion !== '' && <span data-sacado={sacado('condicion') ? 'condicion' : undefined} className={atenuar('condicion')}>{m.condicion}</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-(--color-tenue)">Las motos, sus precios y su condición no se cambian: para otras motos armá otra promoción. Lugar: <span className={atenuar('lugar')}>{lugar}</span>.</p>

      <div className="space-y-1">
        <label htmlFor="copia-frase" className="text-sm font-medium">
          Frase
        </label>
        <input id="copia-frase" className={campo} value={frase} maxLength={LIMITES_DISENO.FRASE} disabled={deshabilitado || sacado('frase')} onChange={(e) => onEscribirFrase(e.target.value)} onBlur={onBlur} />
        <p className="text-xs text-(--color-tenue) tabular-nums">{frase.length}/{LIMITES_DISENO.FRASE} · Sin montos: cada precio va junto a su moto.</p>
        {indicador}
      </div>

      <label className="block text-sm font-medium">
        Botón (llamado a la acción)
        <select className={campo} disabled={deshabilitado || sacado('cta')} value={resuelto.cta} onChange={(e) => onCambiar({ cta: e.target.value as Diseno['cta'] })}>
          {CTAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs" data-testid="linea-pedida">
        <span className="text-(--color-tenue)">Esto es lo que se le pide escribir a la IA: </span>
        {lineaPedida === '' ? <span>nada (la imagen va sin textos)</span> : <span className="font-medium">{lineaPedida}</span>}
      </p>
    </div>
  )
}
