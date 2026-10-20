import { manejarSync } from '@/lib/ingesta/endpoint'
import { sincronizarOrganico } from '@/lib/ingesta/sincronizar-organico'

// Con reintentos por cuota (ADR-010) una corrida puede tardar minutos.
export const maxDuration = 300

export function GET(request: Request) {
  return manejarSync(request, process.env, fetch, sincronizarOrganico)
}
