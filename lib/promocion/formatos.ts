/**
 * POST /api/promociones/[id]/formatos {formato}: la misma placa de diseño en otro tamaño (1:1, 4:5, 9:16).
 *
 * Es GRATIS y no pasa por la compuerta de costo: no llama a ningún modelo. La escena (la moto) se pagó UNA vez; acá
 * solo se recoloca el diseño sobre esa misma escena, con el layout del formato pedido. No escribe la fila: la placa
 * principal (placa_ruta) sigue siendo la del aspecto de la promoción. El archivo se llama por su hash, así pedir
 * dos veces lo mismo no duplica nada. Sirve en borrador y en aprobada (la aprobada no cambia hasta "Volver a editar").
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { esAspectoFoto } from '../productor/ediciones.ts'
import { componerPlaca } from './componer.ts'
import { respuestaDeError } from './errores.ts'
import { nombreDeDescarga } from './pantalla.ts'
import { faltantes, firmarPlaca, obtenerPlaca, type Componer } from './placa.ts'
import { leerPromocion } from './repositorio.ts'
import { esPlantillaDiseno } from './tipos.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

export const MENSAJE_SOLO_SU_FORMATO = 'Este diseño se descarga solo en su formato.'

export async function manejarFormatos(request: Request, id: string, entorno: Entorno, f: Fetch, componer: Componer = componerPlaca): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'descargar otros formatos', f)
  if (ctx instanceof Response) return ctx
  const { supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const formato = cuerpo?.formato
  if (cuerpo === null || typeof cuerpo !== 'object' || !esAspectoFoto(formato)) return error('Elegí un formato: 1:1, 4:5 o 9:16.', 400)

  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)
    if (promo.estado === 'descartada') return error('Esta promoción está descartada.', 409)
    if (!esPlantillaDiseno(promo.plantilla)) {
      return faltantes(promo).length > 0 && promo.plantilla === null ? error(`Todavía falta ${faltantes(promo).join(' y ')}.`, 422) : error(MENSAJE_SOLO_SU_FORMATO, 422)
    }

    const placa = await obtenerPlaca(supabase, promo, f, componer, { formato })
    if (placa instanceof Response) return placa

    return responder({ url: await firmarPlaca(supabase, placa.ruta, f, nombreDeDescarga(promo.modelo, formato)), formato, hash: placa.hash, reutilizada: placa.reutilizada }, 200)
  } catch (e) {
    return respuestaDeError(e, 'la imagen en ese formato')
  }
}
