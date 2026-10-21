import { mensajesDeMarca, type MensajesCuenta } from '@/lib/datos/mensajes'
import type { Filtros } from '@/lib/datos/filtros'
import { Tarjeta, fmt } from './piezas'

export type EstadoMensajes =
  | { readonly tipo: 'ok'; readonly cuentas: readonly MensajesCuenta[] }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Cifra, o "—" cuando Meta no la informa (null). Un 0 real es un 0. */
const cifra = (v: number | null) => (v === null ? '—' : fmt.numero.format(v))

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
      {children}
    </h2>
  )
}

export function MensajesRecibidos({
  estado,
  filtros,
}: {
  estado: EstadoMensajes
  filtros: Pick<Filtros, 'marcaId' | 'plataforma'>
}) {
  if (estado.tipo === 'error') {
    return (
      <section>
        <Titulo>Mensajes recibidos</Titulo>
        <p role="alert" className="rounded-lg border border-(--color-falta) px-4 py-3 text-sm">
          No se pudieron leer los mensajes de la base.{' '}
          <span className="font-mono text-xs text-(--color-tenue)">{estado.mensaje}</span>
        </p>
      </section>
    )
  }

  const { facebook, instagram } = mensajesDeMarca(estado.cuentas, filtros)

  return (
    <section>
      <Titulo>Mensajes recibidos</Titulo>
      {!facebook && !instagram ? (
        <p className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
          Todavía no hay mensajes sincronizados para este período. Corré la sincronización orgánica para traerlos de Meta.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {instagram && (
              <Tarjeta rotulo="Instagram · conversaciones activas" valor={cifra(instagram.activas)} />
            )}
            {facebook && (
              <>
                <Tarjeta rotulo="Facebook · conversaciones activas" valor={cifra(facebook.activas)} />
                <Tarjeta rotulo="Facebook · conversaciones nuevas" valor={cifra(facebook.nuevas)} />
                <Tarjeta rotulo="Facebook · mensajes" valor={cifra(facebook.mensajes)} />
              </>
            )}
          </div>
          <p className="text-xs text-(--color-tenue)">
            Meta no informa qué publicación generó cada mensaje: se cuentan por cuenta y por período. En Instagram no hay
            métrica de conversaciones nuevas; se muestran las activas.
          </p>
        </div>
      )}
    </section>
  )
}
