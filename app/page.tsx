import Link from 'next/link'
import { Navegacion } from '@/components/navegacion'
import { Simulador } from '@/components/home/simulador'
import { MARCAS } from '@/lib/datos/muestra'

export const dynamic = 'force-dynamic'

const AGENTES = [
  {
    nombre: 'Analista',
    fase: 1,
    href: '/tablero',
    que: 'Lee 90 días de datos y dice qué funcionó, qué no y cuándo conviene publicar.',
    costo: 'centavos',
  },
  {
    nombre: 'Estratega',
    fase: 2,
    href: '/campanas',
    que: 'Arma objetivo, mensaje central, reparto por canal y calendario.',
    costo: 'centavos',
  },
  {
    nombre: 'Contenidista',
    fase: 2,
    href: '/contenido',
    que: 'Escribe los copys, los guiones y los hooks con la voz de la marca.',
    costo: 'centavos',
  },
  {
    nombre: 'Productor',
    fase: 3,
    href: '/creativos',
    que: 'Cotiza y genera imágenes y videos. El único que gasta dólares.',
    costo: 'dólares',
  },
]

const CAPACIDADES = [
  {
    titulo: 'Subís una foto y te dice qué se puede hacer',
    detalle:
      'El Productor la analiza y devuelve un menú de opciones con precio: variantes de fondo, carrusel, video animado. Elegís vos.',
    href: '/creativos',
  },
  {
    titulo: 'Los motores caros, cotizados antes de gastar',
    detalle:
      'Doce motores de imagen y video con precios reales. El mismo mes de contenido puede salir USD 2 o USD 28 según cuál elijas.',
    href: '/creativos',
  },
  {
    titulo: 'Tus campañas publicitarias de Meta',
    detalle:
      'Gasto, clics, conversiones y costo por conversión, vía el MCP oficial de Meta Ads.',
    href: '/tablero',
  },
  {
    titulo: 'Publicar con aprobación humana',
    detalle:
      'Cola de publicación con edición antes de salir. Nada se publica sin que alguien le dé el OK.',
    href: '/publicaciones',
  },
]

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/" />

      <header className="mb-10">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          999 Motos · {MARCAS.length} marcas conectadas
        </p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance">
          Un equipo de marketing que lee tus datos antes de opinar
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-(--color-tenue)">
          Cuatro agentes analizan lo que publicaste, arman la campaña, escriben
          el contenido y producen los creativos. Lo que cuesta plata se cotiza
          antes y lo confirmás vos.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Probalo · simulación del flujo completo
        </h2>
        <Simulador />
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          El equipo
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {AGENTES.map((a) => (
            <Link
              key={a.nombre}
              href={a.href}
              className="rounded-lg border border-(--color-borde) px-4 py-3.5 transition-opacity hover:opacity-70"
            >
              <div className="flex items-baseline gap-2">
                <h3 className="font-semibold">{a.nombre}</h3>
                <span className="font-mono text-[0.65rem] text-(--color-tenue)">
                  F{a.fase}
                </span>
                <span className="flex-1" />
                <span
                  className={`text-xs ${
                    a.costo === 'dólares'
                      ? 'text-(--color-aviso)'
                      : 'text-(--color-tenue)'
                  }`}
                >
                  {a.costo}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-(--color-tenue)">{a.que}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Qué más hace
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAPACIDADES.map((c) => (
            <Link
              key={c.titulo}
              href={c.href}
              className="rounded-lg border border-(--color-borde) px-4 py-3.5 transition-opacity hover:opacity-70"
            >
              <h3 className="text-sm font-semibold text-pretty">{c.titulo}</h3>
              <p className="mt-1.5 text-sm text-(--color-tenue)">{c.detalle}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Las marcas
        </h2>
        <div className="flex flex-wrap gap-2">
          {MARCAS.map((m) => (
            <Link
              key={m.id}
              href={`/tablero?marca=${m.id}`}
              className="rounded-full border border-(--color-borde) px-3 py-1 text-sm text-(--color-tenue) transition-opacity hover:opacity-70"
            >
              {m.nombre}
            </Link>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--color-borde) pt-6 text-sm text-(--color-tenue)">
        <span>
          Datos de muestra: las marcas son reales, las métricas están inventadas
          hasta que entre la ingesta.
        </span>
        <span className="flex-1" />
        <Link href="/fases" className="underline underline-offset-4">
          Ver las fases
        </Link>
        <Link href="/configuracion" className="underline underline-offset-4">
          Configuración
        </Link>
      </footer>
    </main>
  )
}
