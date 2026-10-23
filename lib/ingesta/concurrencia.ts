/**
 * Concurrencia acotada para la ingesta (ADR-025). Sin dependencias: un puñado de
 * workers que van sacando de la misma cola. Los resultados salen en el orden de
 * entrada. `tarea` no debe lanzar: cada llamador atrapa sus errores y los
 * devuelve como dato, así una cuenta que falla no tumba a las demás.
 */
export async function enParalelo<T, R>(
  items: readonly T[],
  limite: number,
  tarea: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  const workers = Math.max(1, Math.min(Number.isFinite(limite) ? Math.floor(limite) : 1, items.length))
  let siguiente = 0
  const correr = async () => {
    while (siguiente < items.length) {
      const i = siguiente++
      resultados[i] = await tarea(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: workers }, correr))
  return resultados
}
