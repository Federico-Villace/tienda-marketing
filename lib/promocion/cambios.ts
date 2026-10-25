/**
 * PATCH /api/promociones/[id]: edita los campos del borrador.
 *
 * Nada de lo que se cambia acá cuesta plata ni llama a OpenAI o a Meta. La
 * concurrencia es optimista: la persona manda la `revision` que veía y, si ya no
 * es la vigente, la base responde PT409 y sale un 409. La base además bloquea la
 * fila (for update) y aplica SOLO una lista blanca de campos.
 *
 * Cambiar la foto o el formato invalida la escena generada (es de otra foto o
 * tiene otra proporción): la base la borra y acá se avisa.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { MARCAS } from '../datos/marcas.ts'
import { esAspectoFoto } from '../productor/ediciones.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { rpc, seleccionar } from '../supabase/rest.ts'
import { validarDatos, validarModelo, validarTitular } from './datos.ts'
import { respuestaDeError } from './errores.ts'
import { COLUMNAS_PROMOCION, esFondo, esPlantilla, type FilaPromocion } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const CAMPOS = ['datos', 'modelo', 'marcaId', 'fotoId', 'aspecto', 'plantilla', 'fondo', 'escenaCreativoId', 'titular'] as const

type Campos = Record<string, unknown>

/** Valida el cuerpo y lo pasa a las columnas de la base. Devuelve los errores si hay. */
function leerCampos(cuerpo: Record<string, unknown>): { campos: Campos; errores: string[] } {
  const campos: Campos = {}
  const errores: string[] = []
  for (const k of Object.keys(cuerpo)) {
    if (k !== 'revision' && !(CAMPOS as readonly string[]).includes(k)) errores.push(`El campo "${k}" no está permitido.`)
  }
  if (cuerpo.datos !== undefined) {
    const d = validarDatos(cuerpo.datos)
    if (d.ok) campos.datos = d.datos
    else errores.push(...d.errores)
  }
  if (cuerpo.modelo !== undefined) {
    const m = validarModelo(cuerpo.modelo)
    if (m.ok) campos.modelo = m.modelo
    else errores.push(...m.errores)
  }
  if (cuerpo.marcaId !== undefined) {
    if (typeof cuerpo.marcaId === 'string' && MARCAS.some((m) => m.id === cuerpo.marcaId)) campos.marca_id = cuerpo.marcaId
    else errores.push('Elegí una de las marcas.')
  }
  if (cuerpo.fotoId !== undefined) {
    if (typeof cuerpo.fotoId === 'string' && UUID.test(cuerpo.fotoId)) campos.foto_id = cuerpo.fotoId
    else errores.push('Falta la foto.')
  }
  if (cuerpo.aspecto !== undefined) {
    if (esAspectoFoto(cuerpo.aspecto)) campos.aspecto = cuerpo.aspecto
    else errores.push('Elegí un formato: 1:1, 4:5 o 9:16.')
  }
  if (cuerpo.plantilla !== undefined) {
    if (cuerpo.plantilla === null || esPlantilla(cuerpo.plantilla)) campos.plantilla = cuerpo.plantilla
    else errores.push('Ese diseño no existe.')
  }
  if (cuerpo.fondo !== undefined) {
    if (cuerpo.fondo === null || esFondo(cuerpo.fondo)) campos.fondo = cuerpo.fondo
    else errores.push('Ese fondo no existe.')
  }
  if (cuerpo.escenaCreativoId !== undefined) {
    if (cuerpo.escenaCreativoId === null || (typeof cuerpo.escenaCreativoId === 'string' && UUID.test(cuerpo.escenaCreativoId))) {
      campos.escena_creativo_id = cuerpo.escenaCreativoId
    } else errores.push('La imagen elegida no es válida.')
  }
  if (cuerpo.titular !== undefined) {
    const t = validarTitular(cuerpo.titular)
    if (t.ok) campos.titular = t.titular
    else errores.push(...t.errores)
  }
  return { campos, errores }
}

export async function manejarCambio(request: Request, id: string, entorno: Entorno, f: Fetch): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'cambiar promociones', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)

  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error('El pedido no es válido.', 400)
  const revision = cuerpo.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return error('Falta la revisión de la promoción que estás viendo.', 400)
  }
  if (Object.keys(cuerpo).length === 1) return error('No hay nada para cambiar.', 400)

  const { campos, errores } = leerCampos(cuerpo)
  if (errores.length > 0) return responder({ error: 'Revisá lo que cambiaste.', errores }, 400)

  try {
    const [fila] = await seleccionar<FilaPromocion>(
      supabase,
      'promociones',
      { select: COLUMNAS_PROMOCION, id: `eq.${id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    if (!fila) return error('No se encontró la promoción.', 404)
    if (fila.estado === 'aprobada') return error('Está aprobada: tocá "Volver a editar".', 409)
    if (fila.estado === 'descartada') return error('Esta promoción está descartada.', 409)
    if (fila.revision !== revision) return error('Esta promoción cambió: recargá la pantalla.', 409)

    if (typeof campos.foto_id === 'string') {
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${campos.foto_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró: subí otra.', 410)
    }

    // Una escena solo vale si salió de ESTA promoción y tiene imagen.
    if (typeof campos.escena_creativo_id === 'string') {
      const [escena] = await seleccionar<{ id: string; ruta: string | null; generaciones: { promocion_id: string | null } | null }>(
        supabase,
        'creativos',
        { select: 'id,ruta,generaciones(promocion_id)', id: `eq.${campos.escena_creativo_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!escena || escena.ruta === null || escena.generaciones?.promocion_id !== id) {
        return error('Esa imagen no es de esta promoción.', 422)
      }
    }

    const actualizada = await rpc<FilaPromocion>(
      supabase,
      'editar_promocion',
      { p_id: id, p_revision: revision, p_campos: campos, p_usuario: usuarioId },
      f,
    )

    const avisos: string[] = []
    const traeEscena = campos.escena_creativo_id !== undefined
    if (fila.escena_creativo_id && !traeEscena) {
      if (typeof campos.foto_id === 'string' && campos.foto_id !== fila.foto_id) {
        avisos.push('Cambiaste la foto: la imagen que habías generado se descartó.')
      } else if (typeof campos.aspecto === 'string' && campos.aspecto !== fila.aspecto) {
        avisos.push('Cambiaste el formato: la imagen que habías generado se descartó porque tiene otra proporción.')
      }
    }
    return responder({ promocion: vistaDePromocion(actualizada), avisos }, 200)
  } catch (e) {
    return respuestaDeError(e, 'el cambio')
  }
}
