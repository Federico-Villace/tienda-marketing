import type { ResultadoConexion } from '@/lib/meta/conexion'

function Vencimiento({ vence }: { vence: string }) {
  if (vence === 'nunca') return <>no vence</>
  const fecha = new Date(vence)
  return Number.isNaN(fecha.getTime()) ? (
    <>vencimiento desconocido</>
  ) : (
    <>vence el {fecha.toLocaleDateString('es-AR', { dateStyle: 'long' })}</>
  )
}

function Resultado({ resultado }: { resultado: ResultadoConexion }) {
  if (!resultado.ok) {
    return (
      <div role="alert" className="mt-4 rounded border border-(--color-falta) p-3 text-sm">
        {resultado.mensaje}
        {resultado.detalle && (
          <span className="block font-mono text-xs text-(--color-tenue)">{resultado.detalle}</span>
        )}
      </div>
    )
  }

  return (
    <div role="status" className="mt-4 rounded border border-(--color-ok) p-3 text-sm">
      <p>
        Token guardado en Vault · <code className="font-mono">{resultado.tipo}</code> ·{' '}
        <Vencimiento vence={resultado.vence} />
      </p>
      {resultado.faltan.length === 0 ? (
        <p className="mt-1 text-(--color-tenue)">Están todos los permisos del MVP.</p>
      ) : (
        <div className="mt-2">
          <p className="text-(--color-falta)">
            Faltan permisos. Sumalos a la configuración de Login for Business y volvé a conectar:
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {resultado.faltan.map((p) => (
              <li key={p}>
                <code className="font-mono text-xs">{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ConexionMeta({ resultado }: { resultado: ResultadoConexion | null }) {
  return (
    <section className="mt-12 border-t border-(--color-borde) pt-8">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
        Conexión con Meta
      </h2>
      <p className="text-sm text-(--color-tenue)">
        Elegís en Facebook a qué cuentas das acceso. El token queda cifrado en Supabase Vault y
        nunca pasa por el navegador.
      </p>
      <a
        href="/api/meta/login"
        className="mt-4 inline-block rounded bg-(--color-tinta) px-4 py-2 text-sm font-medium text-(--color-papel)"
      >
        Conectar con Facebook
      </a>
      {resultado && <Resultado resultado={resultado} />}
    </section>
  )
}
