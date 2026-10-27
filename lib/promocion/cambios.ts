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
import { rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { hashJson } from '../agentes/hash.ts'
import { validarDatos, validarDescripcionFondo, validarLineaExtra, validarModelo, validarTitular } from './datos.ts'
import { ejecutarAccion, esAccion } from './acciones.ts'
import { componerPlaca } from './componer.ts'
import { respuestaDeError } from './errores.ts'
import type { Componer } from './placa.ts'
import { marcaPorId } from './marca.ts'
import { validarCopy } from './textos/validar.ts'
import { fuenteMontos } from './datos.ts'
import { escenaEsDe } from './tanda/escena.ts'
import { limitesTexto } from './plantillas.ts'
import { combinacionValida, COLUMNAS_PROMOCION, esFondo, esPlantilla, esPosicionMoto, MENSAJE_COSTADO_SIN_LADO, posicionTextoDe, type CopyPromo, type FilaPromocion, type PosicionMoto } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch

const CAMPOS = ['datos', 'modelo', 'marcaId', 'fotoId', 'aspecto', 'plantilla', 'fondo', 'escenaCreativoId', 'titular', 'copy', 'copyOpcion', 'fondoDescripcion', 'posicionMoto', 'lineaExtra', 'inspiracionFotoId'] as const

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
  if (cuerpo.fondoDescripcion !== undefined) {
    const d = validarDescripcionFondo(cuerpo.fondoDescripcion)
    if (d.ok) campos.fondo_descripcion = d.descripcion
    else errores.push(...d.errores)
  }
  if (cuerpo.posicionMoto !== undefined) {
    if (esPosicionMoto(cuerpo.posicionMoto)) campos.posicion_moto = cuerpo.posicionMoto
    else errores.push('Elegí dónde va la moto: izquierda, centro o derecha.')
  }
  if (cuerpo.inspiracionFotoId !== undefined) {
    if (cuerpo.inspiracionFotoId === null) campos.inspiracion_foto_id = null
    else if (typeof cuerpo.inspiracionFotoId === 'string' && UUID.test(cuerpo.inspiracionFotoId)) campos.inspiracion_foto_id = cuerpo.inspiracionFotoId
    else errores.push('La foto de inspiración no es válida.')
  }
  // La línea extra se valida después de leer la promoción (el largo depende del diseño y el monto, del precio).
  if (cuerpo.lineaExtra !== undefined && cuerpo.lineaExtra !== null && typeof cuerpo.lineaExtra !== 'string') {
    errores.push('La línea extra tiene que ser un texto.')
  }
  // El contenido del texto se valida después de leer la promoción (hace falta su marca).
  if (cuerpo.copy !== undefined && (cuerpo.copy === null || typeof cuerpo.copy !== 'object' || Array.isArray(cuerpo.copy))) {
    errores.push('El texto tiene que ser un objeto con titular, hook, copy, hashtags, cta y altText.')
  }
  if (cuerpo.copyOpcion !== undefined && (typeof cuerpo.copyOpcion !== 'number' || ![1, 2, 3].includes(cuerpo.copyOpcion))) {
    errores.push('La opción de texto tiene que ser 1, 2 o 3.')
  }
  return { campos, errores }
}

type Textos = { id: string; opciones: CopyPromo[] }

/**
 * El texto elegido. Con solo `copyOpcion` se toma la opción guardada (no viaja texto del
 * cliente); con `copy` se valida el texto editado. El humano es la fuente de lo que
 * escribe: no se reemplazan montos. `copy_editado` dice si se apartó de la opción original.
 */
async function resolverCopy(
  s: Supabase,
  fila: FilaPromocion,
  cuerpo: Record<string, unknown>,
  f: Fetch,
): Promise<Record<string, unknown> | Response> {
  const marca = marcaPorId(fila.marca_id)
  const opcion = typeof cuerpo.copyOpcion === 'number' ? cuerpo.copyOpcion : undefined
  let guardada: CopyPromo | undefined
  if (opcion !== undefined && fila.textos_id) {
    const [t] = await seleccionar<Textos>(
      s,
      'textos_promocion',
      { select: 'id,opciones', id: `eq.${fila.textos_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
      f,
    )
    guardada = t?.opciones[opcion - 1]
  }

  let copy: CopyPromo
  let editado: boolean
  if (cuerpo.copy !== undefined) {
    const v = validarCopy(cuerpo.copy, { usuarioIg: marca?.usuarioIg ?? '', fuente: fuenteMontos(fila.datos) })
    if (!v.ok) return responder({ error: 'Revisá el texto.', errores: v.errores }, 400)
    copy = v.copy
    editado = !guardada || hashJson(guardada) !== hashJson(copy)
  } else {
    if (!guardada) return error('Primero pedí los textos.', 422)
    copy = guardada
    editado = false
  }

  const campos: Record<string, unknown> = { copy, copy_editado: editado }
  if (opcion !== undefined) campos.copy_opcion = opcion
  // El titular de la placa sigue al del texto elegido, salvo que la persona ya lo haya personalizado.
  if (cuerpo.titular === undefined && (fila.titular === null || fila.titular === fila.copy?.titular)) campos.titular = copy.titular
  return campos
}

export async function manejarCambio(request: Request, id: string, entorno: Entorno, f: Fetch, componer: Componer = componerPlaca): Promise<Response> {
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
  if (cuerpo.accion !== undefined) {
    if (!esAccion(cuerpo.accion)) return error('Acción desconocida: usá "aprobar", "reabrir" o "descartar".', 400)
    if (Object.keys(cuerpo).length > 2) return error('Una acción no se combina con otros cambios.', 400)
    return ejecutarAccion({ usuarioId, supabase }, id, cuerpo.accion, revision, f, componer)
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

    // El diseño y la moto se validan JUNTOS, con lo que ya había: al costado el lado sale de la moto.
    const plantillaFinal = campos.plantilla !== undefined ? campos.plantilla : fila.plantilla
    const motoFinal = (campos.posicion_moto as PosicionMoto | undefined) ?? fila.posicion_moto
    if (esPlantilla(plantillaFinal) && !combinacionValida(plantillaFinal, motoFinal)) return error(MENSAJE_COSTADO_SIN_LADO, 422)

    // Lo que se escribe en la placa tiene menos lugar si el texto va al costado.
    const limites = limitesTexto(esPlantilla(plantillaFinal) ? posicionTextoDe(plantillaFinal) : 'abajo')
    const erroresTexto: string[] = []
    if (cuerpo.titular !== undefined && campos.titular !== undefined) {
      const t = validarTitular(cuerpo.titular, limites.titular)
      if (!t.ok) erroresTexto.push(...t.errores)
    }
    if (cuerpo.lineaExtra !== undefined && (cuerpo.lineaExtra === null || typeof cuerpo.lineaExtra === 'string')) {
      const l = validarLineaExtra(cuerpo.lineaExtra, (campos.datos as FilaPromocion['datos'] | undefined) ?? fila.datos, limites.extra)
      if (l.ok) campos.linea_extra = l.linea
      else erroresTexto.push(...l.errores)
    }
    if (erroresTexto.length > 0) return responder({ error: 'Revisá lo que cambiaste.', errores: erroresTexto }, 400)

    // Elegir una opción (o editarla): el servidor compara con lo que escribió el redactor.
    if (cuerpo.copy !== undefined || cuerpo.copyOpcion !== undefined) {
      const resultado = await resolverCopy(supabase, fila, cuerpo, f)
      if (resultado instanceof Response) return resultado
      Object.assign(campos, resultado)
    }

    if (typeof campos.foto_id === 'string') {
      const [foto] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${campos.foto_id}`, uso: 'eq.moto', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!foto) return error('No se encontró la foto.', 404)
      if (foto.borrada_en !== null || foto.ruta === null) return error('La foto se borró: subí otra.', 410)
    }

    // La foto de inspiración tiene que ser de inspiración (no la de otra moto) y seguir viva.
    if (typeof campos.inspiracion_foto_id === 'string') {
      const [ref] = await seleccionar<{ id: string; ruta: string | null; borrada_en: string | null }>(
        supabase,
        'fotos',
        { select: 'id,ruta,borrada_en', id: `eq.${campos.inspiracion_foto_id}`, uso: 'eq.inspiracion', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!ref) return error('No se encontró la foto de inspiración.', 404)
      if (ref.borrada_en !== null || ref.ruta === null) return error('La foto de inspiración se borró: subí otra.', 410)
    }

    // Una escena solo vale si salió de ESTA promoción y tiene imagen.
    if (typeof campos.escena_creativo_id === 'string') {
      const [escena] = await seleccionar<{ id: string; ruta: string | null; generaciones: { promocion_id: string | null; tanda_id: string | null } | null }>(
        supabase,
        'creativos',
        { select: 'id,ruta,generaciones(promocion_id,tanda_id)', id: `eq.${campos.escena_creativo_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
        f,
      )
      if (!escena || escena.ruta === null || !escenaEsDe(escena.generaciones, fila)) {
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
