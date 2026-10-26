import { FiltrosComunes } from '@/components/ui/filtros-comunes'
import { MAX_MODELO, type FiltrosLista as Filtros } from '@/lib/promocion/filtros-lista'
import { campo } from './ui'

/** Marca (como en /tablero) y modelo para la lista de promociones. La marca aplica al tocar; el modelo, con "Aplicar". */
export function FiltrosLista({ filtros }: { filtros: Filtros }) {
  return (
    <FiltrosComunes accion="/promocionar" marcaIds={filtros.marcaIds}>
      <label className="block text-xs text-(--color-tenue)">
        Modelo
        <input name="modelo" defaultValue={filtros.modelo} maxLength={MAX_MODELO} className={campo} />
      </label>
    </FiltrosComunes>
  )
}
