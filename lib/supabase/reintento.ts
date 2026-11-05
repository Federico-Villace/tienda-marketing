/**
 * Reloj desfasado entre la función (Vercel) y Supabase: a veces Supabase recibe un token recién emitido
 * y contesta 401 "JWT issued at future". No es un error real: un segundo después anda. Acá no emitimos
 * ningún JWT propio (la clave secreta y la sesión las emite Supabase), así que no hay `iat` que atrasar:
 * se reintenta UNA vez.
 */

const RELOJ = /issued at future|used before issued|iat.{0,20}future/i

export const ESPERA_RELOJ_MS = 1000

/** ¿Este fallo es el del reloj desfasado (y no una credencial mala)? */
export const esRelojDesfasado = (status: number, texto: string): boolean => status === 401 && RELOJ.test(texto)

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Corre `llamar`; si responde el 401 del reloj, espera ~1 s y vuelve a llamar una sola vez. */
export async function conReintentoPorReloj(
  llamar: () => Promise<Response>,
  opciones: { dormir?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const r = await llamar()
  if (r.status !== 401) return r
  if (!esRelojDesfasado(401, await r.clone().text())) return r
  await (opciones.dormir ?? dormirReal)(ESPERA_RELOJ_MS)
  return llamar()
}
