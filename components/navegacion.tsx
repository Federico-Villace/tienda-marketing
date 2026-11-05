import Link from 'next/link'
import { claseItem } from './clase-item'
import { MenuMas } from './menu-mas'

export type Seccion = {
  readonly href: string
  readonly nombre: string
  /** Una línea que dice qué hay adentro (se ve en el menú "Más"). */
  readonly descripcion?: string
  /** false = pantalla de muestra, todavía sin lógica real detrás. */
  readonly construida: boolean
  /** principal: lo que se usa todos los días; mas: las herramientas de cada agente por separado. */
  readonly grupo: 'principal' | 'mas'
}

export const SECCIONES: readonly Seccion[] = [
  { href: '/promocionar', nombre: 'Promociones', construida: true, grupo: 'principal' },
  { href: '/tablero', nombre: 'Resultados', descripcion: 'Qué funcionó en redes y en publicidad, con números.', construida: true, grupo: 'principal' },
  { href: '/creativos', nombre: 'Imágenes', descripcion: 'Crear y revisar imágenes sueltas.', construida: true, grupo: 'mas' },
  { href: '/contenido', nombre: 'Textos', descripcion: 'Epígrafes y guiones para publicar.', construida: true, grupo: 'mas' },
  { href: '/campanas', nombre: 'Planes de campaña', descripcion: 'Qué conviene hacer la semana que viene.', construida: true, grupo: 'mas' },
  { href: '/publicaciones', nombre: 'Publicaciones', descripcion: 'Próximamente: programar y publicar.', construida: false, grupo: 'mas' },
  { href: '/fases', nombre: 'Hoja de ruta', descripcion: 'Qué está listo y qué viene en el proyecto.', construida: true, grupo: 'mas' },
  { href: '/configuracion', nombre: 'Configuración', construida: true, grupo: 'mas' },
]

function esActiva(href: string, activa: string) {
  return activa === href || activa.startsWith(`${href}/`)
}

export function Navegacion({ activa }: { activa: string }) {
  const principales = SECCIONES.filter((s) => s.grupo === 'principal')
  const mas = SECCIONES.filter((s) => s.grupo === 'mas')
  return (
    <nav aria-label="Principal" className="mb-8 flex items-center gap-x-4 border-b border-(--color-borde) pb-3 sm:gap-x-6">
      <Link href="/" className="mr-1 text-base font-semibold tracking-tight sm:mr-4">
        999 Motos
      </Link>
      {principales.map((s) => {
        const activo = esActiva(s.href, activa)
        return (
          <Link key={s.href} href={s.href} aria-current={activo ? 'page' : undefined} className={`${claseItem(activo)} hover:opacity-70`}>
            {s.nombre}
          </Link>
        )
      })}
      <MenuMas items={mas} activa={activa} />
      <form method="post" action="/api/auth/logout" className="ml-auto hidden sm:block">
        <button type="submit" className="py-1 text-sm text-(--color-tenue) hover:opacity-70">
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
  /** Rótulo chico arriba del título; las pantallas del día a día no lo usan. */
  fase?: string
  agente?: string
  titulo: string
  bajada: string
}) {
  return (
    <header className="mb-6">
      {(fase || agente) && (
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          {fase}
          {agente && ` · Agente ${agente}`}
        </p>
      )}
      <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 max-w-2xl text-(--color-tenue)">{bajada}</p>
    </header>
  )
}
