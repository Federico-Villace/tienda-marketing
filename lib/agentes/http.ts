/** Helpers de respuesta HTTP de los handlers de los agentes. */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const responder = (cuerpo: unknown, status: number) => Response.json(cuerpo, { status })
export const error = (mensaje: string, status: number) => responder({ error: mensaje }, status)
