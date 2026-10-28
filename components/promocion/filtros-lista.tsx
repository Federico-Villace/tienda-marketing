import { FiltrosComunes } from '@/components/ui/filtros-comunes'
import type { Ver } from '@/lib/promocion/lista-vista'
import { MAX_MODELO, type FiltrosLista as Filtros } from '@/lib/promocion/filtros-lista'
import { campo } from './ui'

/** Marca (como en /tablero) y modelo para la lista de promociones. La marca aplica al tocar; el modelo, con "Aplicar". */
export function FiltrosLista({ filtros, ver = 'terminar' }: { filtros: Filtros; ver?: Ver }) {
  return (
    <FiltrosComunes accion="/promocionar" marcaIds={filtros.marcaIds} ocultos={ver === 'terminar' ? [] : [['ver', ver]]}>
      <label className="block text-xs text-(--color-tenue)">
        Modelo
        <input name="modelo" defaultValue={filtros.modelo} maxLength={MAX_MODELO} className={campo} />
      </label>
    </FiltrosComunes>
  )
}
