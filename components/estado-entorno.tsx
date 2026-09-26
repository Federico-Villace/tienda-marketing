import {
  ETIQUETAS_GRUPO,
  type EstadoEntorno,
  type EstadoVariable,
  type Grupo,
} from '@/lib/entorno'

const ORDEN_GRUPOS: readonly Grupo[] = ['meta', 'supabase', 'ia', 'cron']

function Fila({ variable }: { variable: EstadoVariable }) {
  const { nombre, presente, obligatoria, descripcion, destraba } = variable

  const marca = presente ? '✓' : obligatoria ? '✗' : '○'
  const colorMarca = presente
    ? 'text-(--color-ok)'
    : obligatoria
      ? 'text-(--color-falta)'
      : 'text-(--color-tenue)'

  return (
    <li className="flex gap-3 border-t border-(--color-borde) py-3 first:border-t-0">
      <span
        className={`mt-0.5 w-4 shrink-0 text-center font-mono text-sm ${colorMarca}`}
        aria-hidden
      >
        {marca}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <code className="font-mono text-sm break-all">{nombre}</code>
          {!obligatoria && (
            <span className="text-xs text-(--color-tenue)">opcional</span>
          )}
        </div>
        <p className="mt-1 text-sm text-(--color-tenue)">{descripcion}</p>
        {!presente && (
          <p className="mt-1 text-xs text-(--color-tenue)">
            Destraba: {destraba}
          </p>
        )}
      </div>

      <span className="sr-only">{presente ? 'configurada' : 'falta'}</span>
    </li>
  )
}

export function PanelEntorno({ estado }: { estado: EstadoEntorno }) {
  const porGrupo = ORDEN_GRUPOS.map((grupo) => ({
    grupo,
    variables: estado.variables.filter((v) => v.grupo === grupo),
  })).filter((g) => g.variables.length > 0)

  const configuradas = estado.variables.filter((v) => v.presente).length

  return (
    <div className="space-y-8">
      <section
        className={`rounded-lg border px-4 py-3 ${
          estado.listo
            ? 'border-(--color-ok) text-(--color-ok)'
            : 'border-(--color-aviso) text-(--color-aviso)'
        }`}
      >
        <p className="text-sm font-medium">
          {estado.listo
            ? 'Entorno completo: las variables obligatorias están todas.'
            : `Faltan ${estado.faltantesObligatorias.length} variables obligatorias.`}
        </p>
        <p className="mt-1 text-xs text-(--color-tenue)">
          {configuradas} de {estado.variables.length} configuradas. La app levanta
          igual: cada clave que sumes destraba una parte.
        </p>
      </section>

      {porGrupo.map(({ grupo, variables }) => (
        <section key={grupo}>
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            {ETIQUETAS_GRUPO[grupo]}
          </h2>
          <ul className="rounded-lg border border-(--color-borde) px-4">
            {variables.map((variable) => (
              <Fila key={variable.nombre} variable={variable} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
