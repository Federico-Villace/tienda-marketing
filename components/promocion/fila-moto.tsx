'use client'

import { formatearPrecio } from '@/lib/promocion/datos'
import { TIPOS_PROMO, type TipoPromo } from '@/lib/promocion/tipos'
import { boton, campo } from './ui'
import type { usarSubidaLote } from './subida-lote'

const PROMOS: Record<TipoPromo, string> = { contado: 'Contado', cuotas: 'Cuotas', credito: 'Crédito', oferta: 'Oferta', ninguna: 'Ninguna' }

/** Una moto del formulario (lote de motos y placa de varias motos): su foto sube aparte; acá viven sus datos tal como se escriben. */
export type MotoForm = { clave: string; modelo: string; moneda: 'ARS' | 'USD'; monto: string; tipo: TipoPromo; detalle: string }
export const motoNueva = (n: number): MotoForm => ({ clave: `m${n}`, modelo: '', moneda: 'ARS', monto: '', tipo: 'contado', detalle: '' })
export const montoDe = (m: MotoForm) => (/^\d+$/.test(m.monto) ? Number(m.monto) : null)
export const motoCompleta = (m: MotoForm) => m.modelo.trim().length >= 2 && (montoDe(m) ?? 0) > 0

/**
 * Una moto del formulario: su foto (con su estado y su reintento), su modelo, su precio y su promo. La comparten el lote de motos (ADR-032) y la
 * placa de varias motos (ADR-041). Las fotos se suben al elegirlas (`subida`) y se quitan con `onQuitar`.
 */
export function FilaMoto({ n, m, derechos, subida, puedeQuitar, onQuitar, onCambio }: { n: number; m: MotoForm; derechos: boolean; subida: ReturnType<typeof usarSubidaLote>; puedeQuitar: boolean; onQuitar: () => void; onCambio: (c: Partial<MotoForm>) => void }) {
  const f = subida.filas[m.clave]
  const monto = montoDe(m)
  const montoMal = m.monto !== '' && monto === null
  const cambiar = (_clave: string, c: Partial<MotoForm>) => onCambio(c)
  return (
        <fieldset className="min-w-0 space-y-3 rounded-lg border border-(--color-borde) px-4 py-3" aria-label={`Moto ${n}`}>
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
                      : `Subiendo la foto… ${f.progreso}%`}
            </p>
            {f?.estado === 'subiendo' && (
              <div role="progressbar" aria-label={`Subiendo la foto de la moto ${n}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.progreso} className="h-2 w-full overflow-hidden rounded-full bg-(--color-borde)">
                <div className="h-full bg-(--color-ok) transition-[width]" style={{ width: `${f.progreso}%` }} />
              </div>
            )}
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
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
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

          <p className="text-xs text-(--color-tenue)">Cada moto lleva su propia promoción.</p>
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

          {puedeQuitar && (
            <button
              type="button"
              className={boton}
              onClick={onQuitar}
            >
              Quitar la moto {n}
            </button>
          )}
        </fieldset>
  )
}
