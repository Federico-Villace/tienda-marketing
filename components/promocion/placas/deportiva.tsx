/**
 * Plantilla "Deportiva": azul eléctrico con diagonales de color flúor, el modelo en letras anchas e
 * inclinadas sobre un panel blanco (con una copia en contorno debajo), frase grande en dos colores debajo de la
 * moto y la barra de precio inclinada. Todo sale de las cajas del layout y de los tamaños ya calculados.
 */

import { partirFrase } from '@/lib/promocion/diseno/ajuste'
import { diagonales } from '@/lib/promocion/diseno/decorados'
import { BASE, BLANCO, colorDe, NEGRO } from '@/lib/promocion/diseno/paletas'
import { enCaja, EscenaFundida, lienzo, Logo, LogoConcesionaria, Pastilla, Pin } from './comun'
import type { PropsPlacaDiseno } from './tipos'

const INCLINACION = -12
/** satori NO dibuja un texto con `color: transparent` (ni su contorno): el relleno del contorno es el azul del fondo al 1 %. */
const RELLENO_CASI_INVISIBLE = 'rgba(21,48,200,0.01)'

export function PlacaDeportiva(p: PropsPlacaDiseno) {
  const { layout, ajuste, recursos, familias: f, textos, diseno } = p
  const { cajas } = layout
  const base = BASE.deportiva
  const acento = colorDe('deportiva', diseno.acento)
  const [primera, segunda] = partirFrase(diseno.frase)
  const esc = cajas.escena
  const condicion = diseno.condicion
  const m = cajas.modelo
  const contorno = cajas.contorno
  if (!contorno) throw new Error('El layout de la deportiva está incompleto.')
  const letra = { fontFamily: f['archivo-expanded'], fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase' } as const

  return (
    <div style={lienzo(p, base.fondo)}>
      {/* Diagonales de color flúor que cruzan la placa por detrás de la moto */}
      <svg width={layout.ancho} height={layout.alto} viewBox={`0 0 ${layout.ancho} ${layout.alto}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {diagonales(layout.ancho, layout.alto).filter((x) => !x.frente).map((x, i) => (
          <path key={i} d={x.d} fill={x.blanco ? BLANCO : acento.hex} opacity={x.opacidad} />
        ))}
      </svg>

      {/* La escena se funde con el azul por los cuatro bordes; las diagonales asoman por los costados */}
      <EscenaFundida src={p.escenaSrc} caja={esc} lados={0.1} arriba={0.18} abajo={0.16} />

      {/* Lo que asoma por los costados, nítido y por delante de la escena (la cuña de la derecha y las líneas finas de la izquierda) */}
      <svg width={layout.ancho} height={layout.alto} viewBox={`0 0 ${layout.ancho} ${layout.alto}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {diagonales(layout.ancho, layout.alto).filter((x) => x.frente).map((x, i) => (
          <path key={i} d={x.d} fill={x.blanco ? BLANCO : acento.hex} opacity={x.opacidad} />
        ))}
      </svg>

      {recursos.logo999 ? <Logo src={recursos.logo999} caja={cajas.logo999} /> : null}
      {recursos.logoMarca ? <Logo src={recursos.logoMarca} caja={cajas.logoMarca} /> : null}

      {/* Modelo: el panel blanco inclinado con el nombre y, justo debajo y a la vista, su copia en contorno de acento */}
      <div style={enCaja(m, { backgroundColor: BLANCO, transform: `skewX(${INCLINACION}deg)` })} />
      <div style={enCaja(m, { alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...letra, fontSize: ajuste.modelo.tam, lineHeight: 1.1, color: base.fondo })}>{textos.modelo.trim()}</div>
      <div style={enCaja(contorno, { alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden', ...letra, fontSize: ajuste.modelo.tam, lineHeight: 1.1, color: RELLENO_CASI_INVISIBLE, WebkitTextStrokeWidth: 3, WebkitTextStrokeColor: acento.hex })}>{textos.modelo.trim()}</div>

      {/* Frase en dos colores, GRANDE, debajo de la moto */}
      {ajuste.frase.lineas > 0 ? (
        <div style={enCaja(cajas.frase, { flexDirection: 'column', justifyContent: 'center', alignItems: diseno.posicionFrase === 'derecha' ? 'flex-end' : 'flex-start', ...letra, fontSize: ajuste.frase.tam, lineHeight: 1.1 })}>
          <div style={{ display: 'flex', color: BLANCO }}>{primera}</div>
          {segunda ? <div style={{ display: 'flex', color: acento.hex }}>{segunda}</div> : null}
        </div>
      ) : null}

      {/* Precio en una barra inclinada a lo ancho */}
      <div style={enCaja(cajas.precio, { backgroundColor: acento.hex, transform: `skewX(${INCLINACION}deg)` })} />
      <div style={enCaja(cajas.precio, { alignItems: 'center', justifyContent: 'center', ...letra, fontSize: ajuste.precio.tam, lineHeight: 1.1, color: acento.sobre })}>{ajuste.textoPrecio}</div>

      {/* Condición en una fila: el texto en blanco y el destacado en una pastilla inclinada */}
      {ajuste.filasCondicion > 0 ? (
        <div style={enCaja(cajas.condicion, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' })}>
          {condicion.texto ? (
            <div style={{ display: 'flex', whiteSpace: 'nowrap', fontFamily: f['barlow-condensed'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.condicionTam, lineHeight: 1.1, color: BLANCO, textTransform: 'uppercase', marginRight: condicion.destacado ? 20 : 0 }}>{condicion.texto}</div>
          ) : null}
          {condicion.destacado ? (
            <Pastilla fondo={acento.hex} color={acento.sobre} tam={ajuste.condicionTam} familia={f['barlow-condensed']} inclinar={INCLINACION}>
              {condicion.destacado}
            </Pastilla>
          ) : null}
        </div>
      ) : null}

      <div style={enCaja(cajas.pie, { alignItems: 'center', justifyContent: 'space-between' })}>
        <Pastilla fondo={BLANCO} color={NEGRO} tam={ajuste.ctaTam} familia={f['barlow-condensed']} inclinar={INCLINACION}>
          {diseno.cta}
        </Pastilla>
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: f['barlow-condensed'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.lugarTam, color: BLANCO, textTransform: 'uppercase' }}>
          <Pin tam={Math.round(ajuste.lugarTam * 1.2)} color={acento.hex} />
          <div style={{ display: 'flex', marginLeft: 8 }}>{textos.lugar.trim()}</div>
        </div>
      </div>

      <LogoConcesionaria p={p} color={BLANCO} familia={f['archivo-expanded']} />
    </div>
  )
}
