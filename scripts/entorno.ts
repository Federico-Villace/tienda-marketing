/**
 * Checklist del entorno en la terminal.
 *
 *   pnpm entorno
 *
 * Lo mismo que muestra la home, sin levantar el servidor. Nunca imprime el
 * valor de una variable: solo si está o no.
 */

import { ETIQUETAS_GRUPO, revisarEntorno, type Grupo } from '../lib/entorno.ts'

const ORDEN: readonly Grupo[] = ['meta', 'supabase', 'ia', 'cron']

const VERDE = '\x1b[32m'
const ROJO = '\x1b[31m'
const GRIS = '\x1b[90m'
const NEGRITA = '\x1b[1m'
const FIN = '\x1b[0m'

const estado = revisarEntorno(process.env)

for (const grupo of ORDEN) {
  const variables = estado.variables.filter((v) => v.grupo === grupo)
  if (variables.length === 0) continue

  console.log(`\n${NEGRITA}${ETIQUETAS_GRUPO[grupo]}${FIN}`)

  for (const v of variables) {
    const marca = v.presente
      ? `${VERDE}✓${FIN}`
      : v.obligatoria
        ? `${ROJO}✗${FIN}`
        : `${GRIS}○${FIN}`

    const sufijo = v.presente
      ? ''
      : ` ${GRIS}→ ${v.destraba}${v.obligatoria ? '' : ' (opcional)'}${FIN}`

    console.log(`  ${marca} ${v.nombre}${sufijo}`)
  }
}

const configuradas = estado.variables.filter((v) => v.presente).length

console.log(`\n${configuradas} de ${estado.variables.length} configuradas.`)

if (estado.listo) {
  console.log(`${VERDE}Todas las obligatorias están.${FIN}\n`)
} else {
  const faltan = estado.faltantesObligatorias
  console.log(
    `${ROJO}Faltan ${faltan.length} obligatorias:${FIN} ${faltan.join(', ')}\n`,
  )
}
