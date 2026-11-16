/** El hash de los textos que se le piden a la IA (solo servidor: usa node:crypto). Dice si una imagen sigue siendo de los textos actuales. */

import { hashJson } from '../../agentes/hash.ts'
import type { TextosCopia } from './tipos.ts'

export const hashTextos = (t: TextosCopia): string => hashJson(t)
