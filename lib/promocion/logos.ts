/**
 * Logos de las concesionarias (assets/logos/manifiesto.json). Puro: no lee archivos (eso es
 * logos-servidor.ts), así lo puede importar el navegador para mostrar los avisos.
 *
 * Reemplazar un logo NO toca código: se pisa el archivo con el mismo nombre (o se edita el JSON).
 * El hash de la placa incluye el sha de los bytes, así que la placa se recompone sola.
 */

import { marcaPorId } from '../datos/marcas.ts'
import type { FormatoImagen } from '../productor/dimensiones.ts'

export const ROLES_LOGO = ['concesionaria', 'marca-moto'] as const
export const TONOS_LOGO = ['claro', 'oscuro', 'color'] as const
export const FONDOS_LOGO = ['transparente', 'solido'] as const
export type RolLogo = (typeof ROLES_LOGO)[number]
export type TonoLogo = (typeof TONOS_LOGO)[number]
export type FondoLogo = (typeof FONDOS_LOGO)[number]
/** Sobre qué fondo va el logo: el de la plantilla. */
export type TonoFondo = 'oscuro' | 'claro'

export type Logo = { id: string; archivo: string; rol: RolLogo; tono: TonoLogo; fondo: FondoLogo }
export type Logo999 = { carpeta: string; archivo: string; tono: TonoLogo; fondo: FondoLogo }
export type EntradaMarca<L extends Logo> = { nombre: string; carpeta: string; es999?: boolean; logos: L[] }
export type Manifiesto<L extends Logo = Logo> = { logo999: Logo999; marcas: Record<string, EntradaMarca<L>> }

/** Lo que se sabe de un logo después de leer el archivo (no se escribe a mano en el JSON). */
export type LogoLeido = Logo & { ancho: number | null; alto: number | null; formato: FormatoImagen | null }
export type ManifiestoLeido = Manifiesto<LogoLeido>

/** Por debajo de este ancho el logo se pixela en la placa (1080 px). */
export const MIN_ANCHO_LOGO = 600
const PEDIDO = 'Pedile a Julián un PNG transparente de 1000 px.'

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const enLista = <T extends string>(lista: readonly T[], x: unknown): x is T => typeof x === 'string' && (lista as readonly string[]).includes(x)
/** Un nombre de carpeta o de archivo, nunca una ruta: no hay forma de salirse de assets/logos. */
const nombreSeguro = (x: unknown): x is string => typeof x === 'string' && /^[\w][\w.\- ]*$/.test(x) && !x.includes('..')

/** `existe` recibe rutas relativas a assets/logos ("suzuki-quilmes/logo.png"). */
export function validarManifiesto(x: unknown, existe: (rutaRelativa: string) => boolean): { ok: true; manifiesto: Manifiesto } | { ok: false; errores: string[] } {
  const errores: string[] = []
  if (!esObj(x) || !esObj(x.logo999) || !esObj(x.marcas)) return { ok: false, errores: ['El manifiesto de logos tiene que tener "logo999" y "marcas".'] }

  const g = x.logo999
  if (!nombreSeguro(g.carpeta) || !nombreSeguro(g.archivo)) errores.push('logo999: carpeta o archivo inválidos.')
  else if (!existe(`${g.carpeta}/${g.archivo}`)) errores.push(`logo999: no existe el archivo ${g.carpeta}/${g.archivo}.`)
  if (!enLista(TONOS_LOGO, g.tono)) errores.push('logo999: el tono tiene que ser claro, oscuro o color.')
  if (!enLista(FONDOS_LOGO, g.fondo)) errores.push('logo999: el fondo tiene que ser transparente o solido.')

  for (const [marcaId, e] of Object.entries(x.marcas)) {
    const donde = `marca ${marcaId}`
    if (!marcaPorId(marcaId)) errores.push(`${donde}: no es una de las marcas del cliente.`)
    if (!esObj(e) || !nombreSeguro(e.carpeta) || typeof e.nombre !== 'string' || !Array.isArray(e.logos)) {
      errores.push(`${donde}: falta nombre, carpeta o logos.`)
      continue
    }
    const vistos = new Set<string>()
    for (const l of e.logos as unknown[]) {
      if (!esObj(l) || typeof l.id !== 'string' || !/^[\w-]+$/.test(l.id)) {
        errores.push(`${donde}: un logo no tiene id válido.`)
        continue
      }
      const nombre = `${donde}, logo ${l.id}`
      if (vistos.has(l.id)) errores.push(`${nombre}: el id está repetido.`)
      vistos.add(l.id)
      if (!enLista(ROLES_LOGO, l.rol)) errores.push(`${nombre}: el rol tiene que ser concesionaria o marca-moto.`)
      if (!enLista(TONOS_LOGO, l.tono)) errores.push(`${nombre}: el tono tiene que ser claro, oscuro o color.`)
      if (!enLista(FONDOS_LOGO, l.fondo)) errores.push(`${nombre}: el fondo tiene que ser transparente o solido.`)
      if (!nombreSeguro(l.archivo)) errores.push(`${nombre}: el archivo tiene que ser un nombre, no una ruta.`)
      else if (!existe(`${e.carpeta}/${l.archivo}`)) errores.push(`${nombre}: no existe el archivo ${l.archivo}.`)
    }
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, manifiesto: x as unknown as Manifiesto }
}

/** El logo de la concesionaria que mejor se ve sobre el fondo de la plantilla; si hay uno solo, ese. */
export function elegirLogo<L extends Logo>(m: Manifiesto<L>, marcaId: string, fondo: TonoFondo): L | null {
  const propios = (m.marcas[marcaId]?.logos ?? []).filter((l) => l.rol === 'concesionaria')
  const contrasta: TonoLogo = fondo === 'oscuro' ? 'claro' : 'oscuro'
  return propios.find((l) => l.tono === contrasta) ?? propios.find((l) => l.tono === 'color') ?? propios[0] ?? null
}

/** Los logos de marca de moto (Vespa, Guzzi…) que una concesionaria puede sumar a la placa. */
export const logosDeMarca = <L extends Logo>(m: Manifiesto<L>, marcaId: string): L[] => (m.marcas[marcaId]?.logos ?? []).filter((l) => l.rol === 'marca-moto')

export type CodigoAviso = 'falta' | 'baja-resolucion' | 'fondo-solido' | 'poco-contraste' | 'formato'
export type AvisoLogo = { codigo: CodigoAviso; /** Id del logo, o null si falta. */ logo: string | null; mensaje: string }

/**
 * Lo que hay que mejorar de los logos de esta placa. Nunca bloquea: la placa sale igual
 * (si falta, con el nombre de la concesionaria en texto).
 */
export function avisosLogo(m: ManifiestoLeido, marcaId: string, fondo: TonoFondo, logoMarcaId: string | null = null): AvisoLogo[] {
  const entrada = m.marcas[marcaId]
  const nombre = entrada?.nombre ?? marcaPorId(marcaId)?.nombre ?? 'esta concesionaria'
  if (entrada?.es999) return []
  const avisos: AvisoLogo[] = []
  const propio = elegirLogo(m, marcaId, fondo)
  if (!propio) {
    avisos.push({ codigo: 'falta', logo: null, mensaje: `Logo de ${nombre}: falta. En la imagen va el nombre en texto. ${PEDIDO}` })
  } else {
    if (propio.ancho !== null && propio.ancho < MIN_ANCHO_LOGO) {
      avisos.push({ codigo: 'baja-resolucion', logo: propio.id, mensaje: `Logo de ${nombre}: es muy chico (${propio.ancho} px) y se va a ver pixelado. ${PEDIDO}` })
    }
    if (propio.fondo === 'solido') avisos.push({ codigo: 'fondo-solido', logo: propio.id, mensaje: `Logo de ${nombre}: tiene fondo de color, no transparente. ${PEDIDO}` })
    if ((propio.tono === 'claro' && fondo === 'claro') || (propio.tono === 'oscuro' && fondo === 'oscuro')) {
      avisos.push({ codigo: 'poco-contraste', logo: propio.id, mensaje: `Logo de ${nombre}: solo está en ${propio.tono === 'claro' ? 'blanco' : 'oscuro'} y casi no se lee en este diseño. Pedile la versión ${fondo === 'claro' ? 'oscura' : 'clara'}.` })
    }
  }
  const marca = logoMarcaId ? logosDeMarca(m, marcaId).find((l) => l.id === logoMarcaId) : undefined
  if (marca?.fondo === 'solido') avisos.push({ codigo: 'fondo-solido', logo: marca.id, mensaje: `Logo ${marca.id}: tiene fondo de color, no transparente. ${PEDIDO}` })
  if (marca?.ancho != null && marca.ancho < MIN_ANCHO_LOGO) {
    avisos.push({ codigo: 'baja-resolucion', logo: marca.id, mensaje: `Logo ${marca.id}: es muy chico (${marca.ancho} px). ${PEDIDO}` })
  }
  return avisos
}
