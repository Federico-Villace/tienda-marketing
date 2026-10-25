import { marcaPorId } from '@/lib/datos/marcas'
import { totalesPublicidad, type AtribucionPublicidad, type CampaniaReal, type Publicidad } from '@/lib/datos/publicidad'
import { Tarjeta, fmt } from './piezas'

/** Las cuentas publicitarias del cliente facturan en pesos. */
const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
const fechaHora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

const ESTADOS: Record<string, string> = {
  ACTIVE: 'activa',
  PAUSED: 'pausada',
  ARCHIVED: 'archivada',
  DELETED: 'borrada',
  CAMPAIGN_PAUSED: 'pausada',
  WITH_ISSUES: 'con problemas',
  IN_PROCESS: 'en proceso',
}

const estadoLegible = (e: string | null) => (e ? (ESTADOS[e] ?? e.toLowerCase()) : '—')

export type EstadoPublicidad =
  | { readonly tipo: 'ok'; readonly datos: Publicidad }
  | { readonly tipo: 'error'; readonly mensaje: string }

const MAX_FILAS = 12

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
      {children}
    </h2>
  )
}

function Tabla({ campanias }: { campanias: readonly CampaniaReal[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
            <th className="px-4 py-2 font-medium">Campaña</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 text-right font-medium">Gasto</th>
            <th className="px-4 py-2 text-right font-medium">Clics</th>
            <th className="px-4 py-2 text-right font-medium">Resultados</th>
            <th className="px-4 py-2 text-right font-medium">Costo / res.</th>
          </tr>
        </thead>
        <tbody>
          {campanias.slice(0, MAX_FILAS).map((c) => (
            <tr key={c.id} className="border-t border-(--color-borde)">
              <td className="max-w-[18rem] px-4 py-2">
                <span className="block truncate">{c.nombre}</span>
                <span className="block truncate text-xs text-(--color-tenue)">{c.cuenta}</span>
              </td>
              <td className="px-4 py-2 text-(--color-tenue)">{estadoLegible(c.estado)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{pesos.format(c.gasto)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.numero.format(c.clics)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt.numero.format(c.resultados)}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {c.resultados > 0 ? pesos.format(c.gasto / c.resultados) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {campanias.length > MAX_FILAS && (
        <p className="border-t border-(--color-borde) px-4 py-2 text-xs text-(--color-tenue)">
          Y {campanias.length - MAX_FILAS} campañas más con menos gasto.
        </p>
      )}
    </div>
  )
}

/**
 * Hay UNA cuenta publicitaria para las 7 marcas: la marca sale del NOMBRE de la campaña (R14),
 * así que es aproximado y se dice. Lo compartido y lo sin marca van aparte: cada peso se cuenta una vez.
 */
function TablaAtribucion({ atribucion }: { atribucion: AtribucionPublicidad }) {
  const filas = [
    ...atribucion.porMarca.map((m) => ({ clave: m.marcaId, rotulo: marcaPorId(m.marcaId)?.nombre ?? m.marcaId, t: m })),
    ...(atribucion.compartidas > 0
      ? [{ clave: 'compartidas', rotulo: `Compartidas (nombran a más de una marca)`, t: atribucion.compartidasTotales }]
      : []),
    { clave: 'sin', rotulo: 'Sin las marcas elegidas en el nombre', t: atribucion.sinAtribuir },
  ]
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Atribuidas por nombre</h3>
      <p className="text-xs text-(--color-tenue)">
        Aproximado: la marca se deduce del nombre de la campaña, no de Meta.
      </p>
      <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
        <table aria-label="Campañas atribuidas por nombre" className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
              <th className="px-4 py-2 font-medium">Marca</th>
              <th className="px-4 py-2 text-right font-medium">Campañas</th>
              <th className="px-4 py-2 text-right font-medium">Gasto</th>
              <th className="px-4 py-2 text-right font-medium">Resultados</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-t border-(--color-borde)">
                <td className="px-4 py-2">{f.rotulo}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.numero.format(f.t.campanias)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{pesos.format(f.t.gasto)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt.numero.format(f.t.resultados)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function PublicidadReal({ estado, atribucion }: { estado: EstadoPublicidad; atribucion?: AtribucionPublicidad }) {
  if (estado.tipo === 'error') {
    return (
      <section>
        <Titulo>Publicidad</Titulo>
        <p role="alert" className="rounded-lg border border-(--color-falta) px-4 py-3 text-sm">
          No se pudo leer la publicidad de la base.{' '}
          <span className="font-mono text-xs text-(--color-tenue)">{estado.mensaje}</span>
        </p>
      </section>
    )
  }

  const { campanias, ultimaSync } = estado.datos
  const t = totalesPublicidad(campanias)

  return (
    <section>
      <Titulo>Publicidad · todas las cuentas publicitarias</Titulo>
      <p className="mb-3 text-xs text-(--color-tenue)">
        Datos reales de Meta
        {ultimaSync?.terminadaEn &&
          ` · actualizado ${fechaHora.format(new Date(ultimaSync.terminadaEn))}`}
        . Resultado = conversación de mensajes iniciada o lead.
      </p>

      {(ultimaSync?.estado === 'error' || ultimaSync?.estado === 'parcial') && (
        <p role="alert" className="mb-3 rounded-lg border border-(--color-aviso) px-4 py-2 text-sm">
          {ultimaSync.estado === 'parcial'
            ? 'La última sincronización fue parcial (algunas cuentas no cargaron):'
            : 'La última sincronización tuvo errores:'}{' '}
          <span className="font-mono text-xs">{ultimaSync.error}</span>
        </p>
      )}

      {campanias.length === 0 ? (
        <p className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
          Todavía no hay campañas sincronizadas. Corré la sincronización para traerlas de Meta.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta rotulo="Gasto" valor={pesos.format(t.gasto)} detalle={`${t.campanias} campañas`} />
            <Tarjeta rotulo="Impresiones" valor={fmt.numero.format(t.impresiones)} />
            <Tarjeta rotulo="Clics" valor={fmt.numero.format(t.clics)} />
            <Tarjeta
              rotulo="Resultados"
              valor={fmt.numero.format(t.resultados)}
              detalle={
                t.costoPorResultado === null
                  ? undefined
                  : `${pesos.format(t.costoPorResultado)} por resultado`
              }
            />
          </div>
          <Tabla campanias={campanias} />
          {atribucion && <TablaAtribucion atribucion={atribucion} />}
        </div>
      )}
    </section>
  )
}
