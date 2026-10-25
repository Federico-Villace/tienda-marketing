/**
 * La marca de una promoción. Hay UNA sola cuenta publicitaria para las 7 marcas,
 * así que las campañas no tienen marca: solo se pueden atribuir por el texto de
 * su NOMBRE (ADR-027, riesgo R14). El token y las cuentas viven en lib/datos/marcas
 * porque el tablero también los usa (ADR-028); acá se re-exportan.
 */

export { cuentasDeMarca, marcaPorId, tokenDeMarca } from '../datos/marcas.ts'
