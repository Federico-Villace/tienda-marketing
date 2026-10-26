import { FiltrosComunes, type PeriodoFiltro } from '@/components/ui/filtros-comunes'
import type { FilaComparacion } from '@/lib/datos/promocion'
import { campo } from './ui'

const numero = new Intl.NumberFormat('es-AR')
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const MAX_MODELOS = 3

/**
 * "Cómo le fue a cada marca" con el mismo modelo: números que suma Postgres, gratis.
 * Las marcas (`marca=`), el período (`desde=`/`hasta=`) y los modelos (hasta 3, `modelo=`)
 * viajan por la URL con los mismos controles que /tablero, así la tabla se comparte y funciona sin JS. La atribución de la publicidad sale del NOMBRE de la campaña.
 */
export function ComparacionMarcas({
  accion,
  marcaIds,
  modelos,
  filas,
  fallo,
  periodo,
}: {
  /** A dónde vuelve el formulario (la misma pantalla). */
  accion: string
  marcaIds: readonly string[]
  modelos: readonly string[]
  filas: readonly FilaComparacion[]
  fallo?: string | null
  periodo: PeriodoFiltro
}) {
  const campos = Array.from({ length: MAX_MODELOS }, (_, i) => modelos[i] ?? '')
  return (
    <section aria-label="Cómo les fue antes" className="space-y-3">
      <h2 className="text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Cómo les fue antes · gratis</h2>
      <FiltrosComunes accion={accion} marcaIds={marcaIds} periodo={periodo}>
        <div className="grid w-full gap-2 sm:grid-cols-3">
          {campos.map((m, i) => (
            <label key={i} className="block text-xs text-(--color-tenue)">
              {i === 0 ? 'Modelo' : `Otro modelo (opcional)`}
              <input name="modelo" defaultValue={m} maxLength={60} className={campo} />
            </label>
          ))}
        </div>
      </FiltrosComunes>
      {fallo ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudo leer la comparación: {fallo}
        </p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-(--color-tenue)">Elegí al menos dos marcas y un modelo para comparar.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
          <table aria-label="Comparación entre marcas" className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
                <th className="px-4 py-2 font-medium">Marca</th>
                <th className="px-4 py-2 font-medium">Modelo</th>
                <th className="px-4 py-2 text-right font-medium">Posts</th>
                <th className="px-4 py-2 text-right font-medium">Vistas prom.</th>
                <th className="px-4 py-2 text-right font-medium">Tasa</th>
                <th className="px-4 py-2 text-right font-medium">Mencionan el modelo</th>
                <th className="px-4 py-2 text-right font-medium">Gasto atribuido</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-(--color-borde)">
                  <td className="px-4 py-2">{f.marca}</td>
                  <td className="px-4 py-2">{f.modelo}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{numero.format(f.publicaciones)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{numero.format(Math.round(f.vistasPromedio))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.tasaInteraccionPct === null ? '—' : `${f.tasaInteraccionPct.toLocaleString('es-AR')}%`}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{numero.format(f.mencionanModelo)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pesos.format(f.gastoAtribuido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-(--color-tenue)">El gasto sale del nombre de la campaña (hay una sola cuenta publicitaria): es aproximado.</p>
    </section>
  )
}
