import { FiltrosComunes } from '@/components/ui/filtros-comunes'
import { SeleccionMultiple } from '@/components/ui/seleccion-multiple'
import { ESTADOS_FILTRABLES, type FiltrosContenido as Filtros } from '@/lib/contenidista/filtros'

const ROTULOS = { borrador: 'Borrador', aprobada: 'Aprobada', descartada: 'Descartada' } as const
const OPCIONES_ESTADO = ESTADOS_FILTRABLES.map((e) => ({ valor: e, rotulo: ROTULOS[e] }))

/** Marca, plataforma y estado de las piezas del calendario. Todo en la URL; el plan elegido se conserva. */
export function FiltrosContenido({ filtros, planId }: { filtros: Filtros; planId: string }) {
  return (
    <FiltrosComunes accion="/contenido" marcaIds={filtros.marcaIds} plataforma={filtros.plataforma} ocultos={[['plan', planId]]}>
      <SeleccionMultiple legend="Estado" opciones={OPCIONES_ESTADO} valor={filtros.estados} name="estado" todas={false} autoEnviar />
    </FiltrosComunes>
  )
}
