/**
 * Plantilla "Como tu referencia" (ADR-039): el fondo (liso o degradé), los colores, las letras y el lugar de cada bloque salen de la LECTURA de
 * la foto de inspiración (PlantillaReferencia, ya validada y reparada). El texto sigue siendo SIEMPRE el de la persona: la IA nunca escribe.
 * La moto va en su propia caja, con la escena fundida sobre el fondo de la referencia (no a sangre completa).
 * Todo sale de las cajas del layout (lib/promocion/referencia/layout.ts) y de los tamaños ya calculados.
 */

import { colorAcentoReferencia, colorFondoMedio } from '@/lib/promocion/referencia/acento'
import { BLANCO_LEGIBLE, NEGRO_LEGIBLE, luminancia, ratioContraste } from '@/lib/promocion/referencia/contraste'
import { cajaDeEscena } from '@/lib/promocion/referencia/escena-caja'
import { esLayoutReferencia } from '@/lib/promocion/referencia/layout'
import { MEDIDAS } from '@/lib/promocion/plantillas'
import type { Alineacion } from '@/lib/promocion/diseno/ajuste'
import { INCLINACION_POR_DEFECTO } from '@/lib/promocion/diseno/tipos'
import { BloqueTexto, enCaja, EscenaFundida, estiloFuente, lienzo, Logo, LogoConcesionaria, Pin } from './comun'
import type { PropsPlacaDiseno } from './tipos'

const JUSTIFICA: Record<Alineacion, 'flex-start' | 'center' | 'flex-end'> = { izquierda: 'flex-start', centro: 'center', derecha: 'flex-end' }
const TEXTO_ALINEADO: Record<Alineacion, 'left' | 'center' | 'right'> = { izquierda: 'left', centro: 'center', derecha: 'right' }
const hayCaja = (c: { w: number; h: number }) => c.w > 0 && c.h > 0

export function PlacaReferencia(p: PropsPlacaDiseno) {
  const { layout, ajuste, recursos, familias: f, textos, diseno, referencia: ref } = p
  if (!ref || !esLayoutReferencia(layout)) throw new Error('La plantilla de la referencia necesita su lectura.')
  const { cajas, alineaciones, estilos } = layout
  const por = INCLINACION_POR_DEFECTO.referencia!
  const acento = colorAcentoReferencia(ref, diseno.acento)
  const original = diseno.acento === 'original'
  const medio = colorFondoMedio(ref)
  // Un texto sobre el fondo: el color leído, salvo que la persona haya elegido otro acento Y se lea sobre ese fondo.
  const conAcento = (leido: string) => (original || ratioContraste(acento.hex, medio) < 3 ? leido : acento.hex)
  const textoBase = luminancia(medio) < 0.18 ? BLANCO_LEGIBLE : NEGRO_LEGIBLE
  const espejado = diseno.variacion === 1
  const fondo = ref.fondo
  const degrada = fondo.tipo === 'degradado' && fondo.color2 !== null
  const horizontal = fondo.direccion === 'horizontal'
  // En la variación espejada el degradé horizontal también se espeja.
  const [c1, c2] = degrada ? (horizontal && espejado ? [fondo.color2!, fondo.color] : [fondo.color, fondo.color2!]) : [fondo.color, fondo.color]
  const aspectoEscena = MEDIDAS[p.aspectoEscena ?? '4:5']
  const escena = cajaDeEscena(cajas.escena, aspectoEscena[0] / aspectoEscena[1])

  const letra = (rol: 'modelo' | 'frase' | 'precio') => estiloFuente(diseno.fuentes[rol], f)
  const fuenteCondicion = estiloFuente(layout.fuentes.condicion, f)
  const fuentePie = estiloFuente(layout.fuentes.pie, f)
  const alinea = (a: Alineacion) => ({ justifyContent: JUSTIFICA[a], textAlign: TEXTO_ALINEADO[a], alignItems: 'center' }) as const

  const estiloPrecio = estilos.precio
  const rellenoPrecio = original ? (ref.precio.relleno ?? ref.acento) : acento.hex
  const colorPrecio = estiloPrecio === 'texto' ? conAcento(ref.precio.color) : original ? ref.precio.color : acento.sobre
  // En otro formato la caja del precio puede quedar mucho más alta que su texto: el recuadro o la barra no pasa de un alto razonable, centrado en la caja.
  const altoFondoPrecio = Math.min(cajas.precio.h, Math.round(ajuste.precio.tam * 1.8))
  const fondoPrecio = { x: cajas.precio.x, y: cajas.precio.y + Math.round((cajas.precio.h - altoFondoPrecio) / 2), w: cajas.precio.w, h: altoFondoPrecio }
  const condicion = diseno.condicion
  const colorCondicion = ref.condicion?.color ?? textoBase
  const colorCta = original ? (ref.cta?.color ?? textoBase) : acento.sobre
  const rellenoCta = original ? (ref.cta?.relleno ?? null) : acento.hex

  return (
    <div style={{ ...lienzo(p, c1), ...(degrada ? { backgroundImage: `linear-gradient(${horizontal ? 'to right' : 'to bottom'}, ${c1}, ${c2})` } : {}) }}>
      {/* La escena (la moto) en su propia caja, fundida con el fondo de la referencia: el aire de arriba y de abajo (30 % y 25 % de la escena) se
          desvanece del todo, así la escena no pisa los textos y la moto queda a opacidad plena dentro de su caja */}
      <EscenaFundida src={p.escenaSrc} caja={escena} lados={0.12} arriba={0.28} abajo={0.22} />

      {recursos.logo999 && hayCaja(cajas.logo999) ? <Logo src={recursos.logo999} caja={cajas.logo999} /> : null}
      {recursos.logoMarca && hayCaja(cajas.logoMarca) ? <Logo src={recursos.logoMarca} caja={cajas.logoMarca} /> : null}

      <BloqueTexto caja={cajas.modelo} grados={diseno.inclinacion.modelo} porDefecto={por.modelo} estilo={{ ...alinea(alineaciones.modelo), ...letra('modelo'), fontSize: ajuste.modelo.tam, color: ref.modelo.color, textTransform: ref.modelo.mayusculas ? 'uppercase' : 'none' }}>
        {textos.modelo.trim()}
      </BloqueTexto>

      {ajuste.frase.lineas > 0 && hayCaja(cajas.frase) ? (
        <BloqueTexto caja={cajas.frase} grados={diseno.inclinacion.frase} porDefecto={por.frase} estilo={{ ...alinea(alineaciones.frase), ...letra('frase'), fontSize: ajuste.frase.tam, color: ref.frase?.color ?? textoBase }}>
          {diseno.frase}
        </BloqueTexto>
      ) : null}

      {/* Precio: texto suelto, dentro de una pastilla o sobre una barra, como en la referencia */}
      {estiloPrecio !== 'texto' ? <div style={enCaja(fondoPrecio, { backgroundColor: rellenoPrecio, borderRadius: estiloPrecio === 'pastilla' ? Math.round(Math.min(fondoPrecio.h / 2, 48)) : 0 })} /> : null}
      <BloqueTexto caja={cajas.precio} grados={diseno.inclinacion.precio} porDefecto={por.precio} estilo={{ ...alinea(alineaciones.precio), ...letra('precio'), fontSize: ajuste.precio.tam, color: colorPrecio }}>
        {ajuste.textoPrecio}
      </BloqueTexto>

      {/* Condición: el texto y, si hay, el destacado en una pastilla del acento */}
      {ajuste.filasCondicion > 0 && hayCaja(cajas.condicion) ? (
        <div style={enCaja(cajas.condicion, { flexDirection: ajuste.condicionEnFila ? 'row' : 'column', ...alinea(alineaciones.condicion), ...fuenteCondicion, fontSize: ajuste.condicionTam, color: colorCondicion, textTransform: 'uppercase' })}>
          {condicion.texto ? <div style={{ display: 'flex', whiteSpace: 'nowrap', marginRight: condicion.destacado && ajuste.condicionEnFila ? 20 : 0 }}>{condicion.texto}</div> : null}
          {condicion.destacado ? (
            <div style={{ display: 'flex', whiteSpace: 'nowrap', backgroundColor: acento.hex, color: acento.sobre, padding: `${Math.round(ajuste.condicionTam * 0.1)}px 24px` }}>{condicion.destacado}</div>
          ) : null}
        </div>
      ) : null}

      {/* Pie: el botón del CTA y el lugar */}
      {hayCaja(cajas.pie) && ajuste.ctaTam > 0 ? (
        <div style={enCaja(cajas.pie, { alignItems: 'center', justifyContent: 'space-between' })}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              ...fuentePie,
              fontSize: ajuste.ctaTam,
              color: colorCta,
              textTransform: 'uppercase',
              padding: `${Math.round(ajuste.ctaTam * 0.12)}px 24px`,
              ...(rellenoCta ? { backgroundColor: rellenoCta } : { border: `3px solid ${colorCta}` }),
            }}
          >
            {diseno.cta}
          </div>
          {ajuste.lugarTam > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', ...fuentePie, fontSize: ajuste.lugarTam, color: textoBase, textTransform: 'uppercase' }}>
              <Pin tam={Math.round(ajuste.lugarTam * 1.2)} color={acento.hex} />
              <div style={{ display: 'flex', marginLeft: 8 }}>{textos.lugar.trim()}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hayCaja(cajas.logoConcesionaria) ? <LogoConcesionaria p={p} color={textoBase} familia={f['archivo-expanded']} /> : null}
    </div>
  )
}
