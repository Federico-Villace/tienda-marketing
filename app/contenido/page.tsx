import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'

const PIEZAS = [
  ['Lun 06', 'Reel', 'Instagram', '¿Cuánto gastás por mes en colectivo? Te muestro la cuenta.', 'Hook en los primeros 2s, texto en pantalla'],
  ['Mar 07', 'Carrusel', 'Instagram', '5 cosas que nadie te cuenta antes de comprar tu primera 0km', '5 placas, CTA en la última'],
  ['Jue 09', 'Reel', 'Instagram', 'Entregamos 3 unidades esta semana. Mirá las caras.', 'Prueba social, sin locución'],
  ['Vie 10', 'Posteo', 'Facebook', 'Financiación en 12 cuotas fijas. Consultá por mensaje.', 'Público 35+, CTA a Messenger'],
  ['Sáb 11', 'Reel', 'Instagram', 'Test ride: probala antes de decidir', 'Cámara en mano, sonido ambiente'],
]

export default function Contenido() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/contenido" />
      <Encabezado
        fase="Fase 2"
        agente="Contenidista"
        titulo="Calendario de contenido"
        bajada="Toma el plan del Estratega y el perfil de marca, y escribe los copys, los guiones y los hooks. Sigue siendo texto puro: centavos."
      />
      <Aviso>Pantalla de muestra. El agente todavía no está conectado.</Aviso>

      <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Formato</th>
              <th className="px-4 py-2 font-medium">Canal</th>
              <th className="px-4 py-2 font-medium">Copy</th>
              <th className="px-4 py-2 font-medium">Nota de producción</th>
            </tr>
          </thead>
          <tbody>
            {PIEZAS.map(([fecha, formato, canal, copy, nota]) => (
              <tr key={String(fecha)} className="border-t border-(--color-borde)">
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-(--color-tenue)">{fecha}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formato}</td>
                <td className="px-4 py-3 whitespace-nowrap text-(--color-tenue)">{canal}</td>
                <td className="px-4 py-3">{copy}</td>
                <td className="px-4 py-3 text-xs text-(--color-tenue)">{nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-(--color-tenue)">
        Desde acá cada pieza pasa al Productor, que cotiza los creativos antes
        de generarlos.
      </p>
    </main>
  )
}
