/**
 * Corre `fn` sobre cada elemento con a lo sumo `limite` en vuelo. Devuelve los
 * resultados en el orden de entrada; si uno falla, en su lugar queda el Error y
 * los demás siguen (el lote muestra el error por tarjeta y deja reintentar).
 */
export async function enLotes<T, R>(items: readonly T[], limite: number, fn: (x: T, i: number) => Promise<R>): Promise<(R | Error)[]> {
  const salida: (R | Error)[] = new Array(items.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++
      try {
        salida[i] = await fn(items[i]!, i)
      } catch (e) {
        salida[i] = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador))
  return salida
}
