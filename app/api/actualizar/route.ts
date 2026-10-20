import { manejarActualizar } from '@/lib/ingesta/actualizar'
import { sincronizarPublicidad } from '@/lib/ingesta/sincronizar'
import { sincronizarOrganico } from '@/lib/ingesta/sincronizar-organico'

// Publicidad + orgánico en serie, con reintentos por cuota (ADR-010): pueden tardar minutos.
export const maxDuration = 300

export function POST(request: Request) {
  return manejarActualizar(request, process.env, fetch, {
    publicidad: sincronizarPublicidad,
    organico: sincronizarOrganico,
  })
}
