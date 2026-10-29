import type { Supabase } from '../../supabase/rest.ts'

export type Objeto = 'promocion' | 'pieza'

export type Topes = { maxTurnos: number; topeUsdItem: number; topeUsdDiario: number }

export type TokensTurno = { entrada: number; salida: number; cacheados: number; razonamiento: number }

export type TurnoVista = {
  id: string
  turno: number
  pedido: string
  estado: 'pendiente' | 'ok' | 'error'
  respuesta: Record<string, unknown> | null
  error: string | null
  costoUsd: number
  creadoEn: string
}

export type ArgsAbrir = {
  org: string
  objeto: Objeto
  objetoId: string
  pedido: string
  usuarioId: string
  estimadoUsd: number
  topes: Topes
}

export type ContextoSupabase = { s: Supabase }
