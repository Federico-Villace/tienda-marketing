import Link from 'next/link'

export type Seccion = {
  readonly href: string
  readonly nombre: string
  readonly fase: number
  /** false = pantalla de muestra, todavía sin lógica real detrás. */
  readonly construida: boolean
}

export const SECCIONES: readonly Seccion[] = [
  { href: '/', nombre: 'Configuración', fase: 1, construida: true },
  { href: '/tablero', nombre: 'Analista', fase: 1, construida: true },
  { href: '/campanas', nombre: 'Estratega', fase: 2, construida: false },
  { href: '/contenido', nombre: 'Contenidista', fase: 2, construida: false },
  { href: '/creativos', nombre: 'Productor', fase: 3, construida: true },
  { href: '/publicaciones', nombre: 'Publicación', fase: 4, construida: false },
  { href: '/fases', nombre: 'Fases', fase: 0, construida: true },
]

export function Navegacion({ activa }: { activa: string }) {
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-(--color-borde) pb-4">
      {SECCIONES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.href === activa ? 'page' : undefined}
          className={`rounded-md px-2.5 py-1 text-sm ${
            s.href === activa
              ? 'font-semibold'
              : 'text-(--color-tenue) hover:opacity-70'
          }`}
        >
          {s.nombre}
          {s.fase > 0 && (
            <span className="ml-1.5 font-mono text-[0.65rem] opacity-50">
              F{s.fase}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-8 rounded-lg border border-(--color-aviso) px-4 py-2.5 text-sm text-(--color-aviso)"
    >
      {children}
    </div>
  )
}

export function Encabezado({
  fase,
  agente,
  titulo,
  bajada,
}: {
  fase: string
  agente?: string
  titulo: string
  bajada: string
}) {
  return (
    <header className="mb-6">
      <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
        {fase}
        {agente && ` · Agente ${agente}`}
      </p>
      <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 max-w-2xl text-(--color-tenue)">{bajada}</p>
    </header>
  )
}
