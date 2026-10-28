import Link from 'next/link'

export type Seccion = {
  readonly href: string
  readonly nombre: string
  /** Una línea que dice qué hay adentro (se ve en el menú "Más herramientas"). */
  readonly descripcion?: string
  /** false = pantalla de muestra, todavía sin lógica real detrás. */
  readonly construida: boolean
  /** principal: lo que se usa todos los días; mas: las herramientas de cada agente por separado. */
  readonly grupo: 'principal' | 'mas'
}

export const SECCIONES: readonly Seccion[] = [
  { href: '/promocionar', nombre: 'Promociones', construida: true, grupo: 'principal' },
  { href: '/', nombre: 'Inicio', construida: true, grupo: 'principal' },
  { href: '/tablero', nombre: 'Resultados y análisis', descripcion: 'Qué funcionó en redes y en publicidad, con números.', construida: true, grupo: 'mas' },
  { href: '/campanas', nombre: 'Planes de campaña', descripcion: 'Qué conviene hacer la semana que viene.', construida: true, grupo: 'mas' },
  { href: '/contenido', nombre: 'Textos', descripcion: 'Epígrafes y guiones para publicar.', construida: true, grupo: 'mas' },
  { href: '/creativos', nombre: 'Imágenes', descripcion: 'Crear y revisar imágenes sueltas.', construida: true, grupo: 'mas' },
  { href: '/publicaciones', nombre: 'Publicaciones', descripcion: 'Próximamente: programar y publicar.', construida: false, grupo: 'mas' },
  { href: '/fases', nombre: 'Hoja de ruta', descripcion: 'Qué está listo y qué viene en el proyecto.', construida: true, grupo: 'mas' },
  { href: '/configuracion', nombre: 'Configuración', construida: true, grupo: 'principal' },
]

function Enlace({ s, activa }: { s: Seccion; activa: string }) {
  const esActiva = s.href === activa
  // "Promociones" es la entrada principal: con borde, para que se vea que es por donde se empieza.
  const resaltada = s.href === '/promocionar'
  return (
    <Link
      href={s.href}
      aria-current={esActiva ? 'page' : undefined}
      className={`min-h-9 rounded-md px-2.5 py-1 text-sm ${resaltada ? 'border border-(--color-ok) font-semibold' : ''} ${
        esActiva ? 'font-semibold' : resaltada ? '' : 'text-(--color-tenue) hover:opacity-70'
      }`}
    >
      {s.nombre}
      {s.descripcion && <span className="block text-xs font-normal text-(--color-tenue)">{s.descripcion}</span>}
    </Link>
  )
}

export function Navegacion({ activa }: { activa: string }) {
  const principales = SECCIONES.filter((s) => s.grupo === 'principal')
  const mas = SECCIONES.filter((s) => s.grupo === 'mas')
  return (
    <nav aria-label="Principal" className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-(--color-borde) pb-4">
      {principales.slice(0, 2).map((s) => (
        <Enlace key={s.href} s={s} activa={activa} />
      ))}
      <details className="relative" open={mas.some((s) => s.href === activa) || undefined}>
        <summary className="cursor-pointer rounded-md px-2.5 py-1 text-sm text-(--color-tenue) hover:opacity-70">Más herramientas</summary>
        <div className="mt-1 flex flex-col gap-y-1 rounded-md border border-(--color-borde) p-1.5 sm:absolute sm:z-10 sm:w-72 sm:bg-(--color-papel)">
          {mas.map((s) => (
            <Enlace key={s.href} s={s} activa={activa} />
          ))}
        </div>
      </details>
      {principales.slice(2).map((s) => (
        <Enlace key={s.href} s={s} activa={activa} />
      ))}
      <form method="post" action="/api/auth/logout" className="ml-auto">
        <button type="submit" className="rounded-md px-2.5 py-1 text-sm text-(--color-tenue) hover:opacity-70">
          Salir
        </button>
      </form>
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
