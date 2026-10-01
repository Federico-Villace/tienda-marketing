import Link from 'next/link'
import { Encabezado, Navegacion } from '@/components/navegacion'

const FASES = [
  {
    n: 0,
    nombre: 'Auditoría de accesos',
    estado: 'hecho',
    que: 'Confirmar qué permisos trae el token de Meta y qué cuentas alcanza.',
    resultado: 'Instagram completo (lectura Y publicación). Faltan ads_read y un token de system user.',
    href: null,
  },
  {
    n: 1,
    nombre: 'Ingesta + tablero + Analista',
    estado: 'en curso',
    que: 'Traer publicaciones y campañas a Postgres, mostrarlas, y que un agente escriba qué funcionó.',
    resultado: 'Esquema aplicado y tablero andando con datos de muestra. Falta la ingesta real.',
    href: '/tablero',
  },
  {
    n: 2,
    nombre: 'Estratega + Contenidista',
    estado: 'pendiente',
    que: 'Plan de campaña y calendario de contenido. Dos agentes de texto.',
    resultado: 'Solo texto: el costo del mes sigue siendo centavos.',
    href: '/campanas',
  },
  {
    n: 3,
    nombre: 'Productor + compuerta de costo',
    estado: 'parcial',
    que: 'Cotizar y generar imágenes y videos. Subir una foto y recibir opciones con precio.',
    resultado: 'El estimador ya es real y está testeado. Falta conectar los motores.',
    href: '/creativos',
  },
  {
    n: 4,
    nombre: 'Publicación con aprobación',
    estado: 'pendiente',
    que: 'Cola, edición y publicación en Instagram y Facebook.',
    resultado: 'Sin App Review: el permiso de publicación ya está aprobado.',
    href: '/publicaciones',
  },
  {
    n: 5,
    nombre: 'CRM de 999 Motos',
    estado: 'sin relevar',
    que: 'Conectar la plataforma al CRM por API.',
    resultado: 'No se promete hasta saber si ese CRM tiene API documentada.',
    href: null,
  },
]

const MARCA: Record<string, string> = {
  hecho: 'text-(--color-ok)',
  'en curso': 'text-(--color-aviso)',
  parcial: 'text-(--color-aviso)',
  pendiente: 'text-(--color-tenue)',
  'sin relevar': 'text-(--color-tenue)',
}

const CAPAS = [
  ['Capa 1 · Ingesta', 'Cron diario → Meta → Postgres. Cero IA.', '~USD 0'],
  ['Capa 2 · Análisis', 'LLM sobre agregados de SQL, cacheado por hash.', 'centavos'],
  ['Capa 3 · Generación', 'Imagen y video. Detrás de confirmación humana.', 'dólares'],
]

export default function Fases() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/fases" />
      <Encabezado
        fase="Mapa del producto"
        titulo="Las seis fases"
        bajada="Dónde está cada cosa de la idea original y qué está construido de verdad."
      />

      <section className="mb-10">
        <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Las tres capas y por qué están separadas
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CAPAS.map(([titulo, que, costo]) => (
            <div key={titulo} className="rounded-lg border border-(--color-borde) px-4 py-3">
              <p className="text-sm font-medium">{titulo}</p>
              <p className="mt-1 text-xs text-(--color-tenue)">{que}</p>
              <p className="mt-2 font-mono text-xs">{costo}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-(--color-tenue)">
          La capa 2 nunca llama a la API de Meta: lee de Postgres. La capa 3 no
          arranca sin un click humano. Esa separación es lo que hace que el
          costo sea predecible.
        </p>
      </section>

      <ol className="space-y-3">
        {FASES.map((f) => (
          <li key={f.n} className="rounded-lg border border-(--color-borde) px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-xs text-(--color-tenue)">F{f.n}</span>
              <h3 className="text-sm font-semibold">{f.nombre}</h3>
              <span className={`text-xs ${MARCA[f.estado]}`}>{f.estado}</span>
              <span className="flex-1" />
              {f.href && (
                <Link href={f.href} className="text-xs underline underline-offset-4">
                  ver pantalla →
                </Link>
              )}
            </div>
            <p className="mt-1.5 text-sm text-(--color-tenue)">{f.que}</p>
            <p className="mt-1 text-xs text-(--color-tenue)">{f.resultado}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
