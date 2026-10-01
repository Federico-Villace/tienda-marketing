import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'

const PLAN = {
  objetivo: 'Vender 12 unidades 0km de la línea urbana en 30 días',
  publico: 'Hombres y mujeres 25–45, Quilmes y alrededores, primer 0km o recambio',
  mensaje: 'Salí del colectivo. Tu primera 0km con cuota fija.',
  presupuesto: 'USD 420 en pauta',
  canales: [
    ['Instagram', 'Reels + carrusel', '60% del presupuesto', 'El formato que más rinde según el Analista'],
    ['Facebook', 'Posteos + Marketplace', '25%', 'Público mayor, consulta por mensaje'],
    ['Email', 'Base de service', '0%', 'Recontacto a quienes ya compraron'],
  ],
  calendario: [
    ['Semana 1', 'Expectativa', '3 reels, 2 carruseles'],
    ['Semana 2', 'Producto y financiación', '4 reels, 1 carrusel, email 1'],
    ['Semana 3', 'Prueba social y testimonios', '3 reels, 2 carruseles, email 2'],
    ['Semana 4', 'Urgencia y cierre', '4 reels, email 3'],
  ],
}

export default function Campanas() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/campanas" />
      <Encabezado
        fase="Fase 2"
        agente="Estratega"
        titulo="Plan de campaña"
        bajada="Lee lo que escribió el Analista —no los datos crudos— y arma objetivo, mensaje central, reparto por canal y calendario. Solo texto: cuesta centavos."
      />
      <Aviso>Pantalla de muestra. El agente todavía no está conectado.</Aviso>

      <div className="space-y-8">
        <section className="grid gap-3 sm:grid-cols-2">
          {[
            ['Objetivo', PLAN.objetivo],
            ['Público', PLAN.publico],
            ['Mensaje central', PLAN.mensaje],
            ['Presupuesto', PLAN.presupuesto],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-lg border border-(--color-borde) px-4 py-3">
              <p className="text-xs tracking-wide text-(--color-tenue) uppercase">{rotulo}</p>
              <p className="mt-1 text-sm">{valor}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Reparto por canal
          </h2>
          <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
            <table className="w-full min-w-[34rem] text-sm">
              <tbody>
                {PLAN.canales.map(([canal, formato, parte, porque]) => (
                  <tr key={canal} className="border-t border-(--color-borde) first:border-t-0">
                    <td className="px-4 py-2.5 font-medium">{canal}</td>
                    <td className="px-4 py-2.5 text-(--color-tenue)">{formato}</td>
                    <td className="px-4 py-2.5 tabular-nums">{parte}</td>
                    <td className="px-4 py-2.5 text-xs text-(--color-tenue)">{porque}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Calendario
          </h2>
          <ol className="space-y-2">
            {PLAN.calendario.map(([semana, eje, piezas]) => (
              <li key={semana} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-(--color-borde) px-4 py-2.5">
                <span className="w-20 shrink-0 font-mono text-xs text-(--color-tenue)">{semana}</span>
                <span className="flex-1 text-sm font-medium">{eje}</span>
                <span className="text-xs text-(--color-tenue)">{piezas}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
