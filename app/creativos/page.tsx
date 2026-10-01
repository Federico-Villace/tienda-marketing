import { Compuerta } from '@/components/creativos/compuerta'
import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'

export default function Creativos() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/creativos" />
      <Encabezado
        fase="Fase 3"
        agente="Productor"
        titulo="Compuerta de costo"
        bajada="El único agente que gasta dólares. Propone y cotiza; el gasto lo confirma una persona. Esta pantalla ya usa el estimador real: los precios y las cuentas son los de producción."
      />
      <Aviso>
        Los precios son reales y están testeados. Lo que todavía no existe es la
        generación: confirmar no dispara ningún job.
      </Aviso>
      <Compuerta />

      <section className="mt-12 border-t border-(--color-borde) pt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Subir una imagen y ver qué se puede hacer
        </h2>
        <div className="rounded-lg border border-dashed border-(--color-borde) px-4 py-8 text-center">
          <p className="text-sm text-(--color-tenue)">
            Arrastrá una foto de una moto
          </p>
          <p className="mt-1 text-xs text-(--color-tenue)">
            El Productor la analiza con un modelo de visión (centavos) y
            devuelve un menú de opciones con precio
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {[
            ['3 variantes de fondo', 'Flux 2 Pro · 3 × USD 0,02', 'USD 0,06'],
            ['Carrusel de 5 piezas', 'Flux 2 Pro · 5 × USD 0,02', 'USD 0,10'],
            ['Video de 8s animando la cámara', 'Runway Gen-4 Turbo · 8s × USD 0,05', 'USD 0,40'],
            ['Video premium de 8s con audio', 'Veo 3.1 Standard · 8s × USD 0,75', 'USD 6,00'],
          ].map(([que, como, cuanto]) => (
            <li
              key={que}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-(--color-borde) px-4 py-2.5"
            >
              <div>
                <p className="text-sm">{que}</p>
                <p className="text-xs text-(--color-tenue)">{como}</p>
              </div>
              <span className="text-sm font-medium tabular-nums">{cuanto}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-(--color-tenue)">
          Ese menú es el corazón de la idea: la foto no se transforma sola.
          Primero ves qué se puede hacer y cuánto sale cada cosa.
        </p>
      </section>
    </main>
  )
}
