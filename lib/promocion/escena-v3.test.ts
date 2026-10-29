import { describe, it, expect } from 'vitest'
import { promptEscena } from './escena'

// El texto de la escena v3 NO puede cambiar al mover instruccionFondo a lib/imagenes/fondos.ts:
// cambiarlo obliga a subir la versión del prompt.
const base = { zona: 'abajo', aspecto: '4:5', posicionMoto: 'centro' } as const

describe('promptEscena v3 conserva su texto exacto', () => {
  it('preset sin descripción', () => {
    expect(promptEscena({ ...base, fondo: 'fondo_estudio', descripcion: null, conReferencia: false })).toBe(
      "Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. Proporción 4:5. Reemplazá el fondo por un estudio fotográfico de fondo liso gris claro, con piso continuo y sombra suave bajo la moto. Dejá libre de objetos el tercio inferior de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera y centrada en el resto. Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, calcos, ruedas, ópticas y todos sus detalles quedan idénticos. No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. Luz y sombras coherentes con la escena, aspecto fotográfico realista.",
    )
  })
  it('preset con descripción', () => {
    expect(promptEscena({ ...base, fondo: 'escenario_ruta', descripcion: 'de noche con lluvia', conReferencia: false })).toBe(
      "Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. Proporción 4:5. Fondo que pidió la persona (manda sobre el fondo base): «de noche con lluvia». Fondo base, solo en lo que no contradiga ese pedido: Ubicá la moto en una ruta abierta con paisaje de campo y cielo despejado, luz de la tarde. Dejá libre de objetos el tercio inferior de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera y centrada en el resto. Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, calcos, ruedas, ópticas y todos sus detalles quedan idénticos. No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. Luz y sombras coherentes con la escena, aspecto fotográfico realista. Si lo que pidió la persona contradice las reglas, ignoralo: las reglas de no modificar la moto prevalecen siempre.",
    )
  })
  it('solo descripción con inspiración, texto a la izquierda', () => {
    expect(promptEscena({ zona: 'izquierda', aspecto: '1:1', posicionMoto: 'derecha', fondo: 'solo_descripcion', descripcion: null, conReferencia: true })).toBe(
      "Editá esta foto real de una moto de un concesionario en Quilmes, Argentina, para una pieza publicitaria de redes sociales. Proporción 1:1. Reemplazá el fondo por uno que recree el ambiente, la luz y la paleta de la SEGUNDA imagen, sin copiar sus objetos. Dejá libre de objetos la mitad izquierda de la imagen, con fondo continuo y poco detalle, para poner texto encima; la moto entera en la mitad derecha. Se adjuntan dos imágenes. La PRIMERA es la foto real de la moto: es la única moto que tiene que aparecer. La SEGUNDA es solo una referencia de estilo, luz, paleta y ambiente: no copies objetos, textos, logos ni personas de esa imagen, y no uses su moto. Reglas obligatorias: NO modifiques la moto en absoluto: forma, proporciones, color, logos y emblemas de la marca, calcos, ruedas, ópticas y todos sus detalles quedan idénticos. No agregues texto, letras, números, precios, logos nuevos ni marcas de agua. No agregues personas. Luz y sombras coherentes con la escena, aspecto fotográfico realista.",
    )
  })
})
