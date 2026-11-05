import { formatearUsdCorto, formatearUsdExacto } from '@/lib/costos/formato'

/** Un costo en centavos; el valor exacto queda al pasar el mouse. `estimado` redondea hacia arriba y lleva "~". */
export function Costo({ usd, estimado = false }: { usd: number; estimado?: boolean }) {
  return <span title={formatearUsdExacto(usd)}>{formatearUsdCorto(usd, { estimado })}</span>
}
