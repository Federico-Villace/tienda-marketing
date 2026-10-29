/** Topes de los pedidos de cambio (imagen y texto). Los topes de dinero se aplican en Postgres (abrir_turno). */

export const MIN_PEDIDO = 3
export const MAX_PEDIDO = 400
/** Cuántos pedidos anteriores se le recuerdan al modelo. */
export const PEDIDOS_HISTORIAL = 4
/** Un pedido pendiente más viejo que esto se da por vencido (el proceso se cayó). */
export const VENCE_PENDIENTE_S = 120

/** Cambios de texto: máximo de turnos y de gasto por ítem. */
export const CAMBIO_TEXTO = { maxTurnos: 30, topeUsdItem: 0.05 } as const
/** Gasto diario de la organización en conversaciones (compartido con el Analista chat). */
export const TOPE_USD_DIARIO = 0.5

export const MENSAJE_PEDIDO = 'Escribí qué querés cambiar (hasta 400 caracteres)'
