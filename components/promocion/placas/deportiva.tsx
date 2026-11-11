/**
 * Plantilla "Deportiva": azul eléctrico con diagonales de color flúor, el modelo en letras anchas e
 * inclinadas sobre un panel blanco (con una copia en contorno detrás), frase en dos colores y la barra de
 * precio inclinada. Todo sale de las cajas del layout y de los tamaños ya calculados.
 */

import { partirFrase } from '@/lib/promocion/diseno/ajuste'
import { diagonales } from '@/lib/promocion/diseno/decorados'
import { BASE, BLANCO, colorDe, NEGRO } from '@/lib/promocion/diseno/paletas'
import { enCaja, EscenaFundida, lienzo, Logo, LogoConcesionaria, Pastilla, Pin } from './comun'
import type { PropsPlacaDiseno } from './tipos'

const INCLINACION = -12

export function PlacaDeportiva(p: PropsPlacaDiseno) {
  const { layout, ajuste, recursos, familias: f, textos, diseno } = p
  const { cajas } = layout
  const base = BASE.deportiva
  const acento = colorDe('deportiva', diseno.acento)
  const [primera, segunda] = partirFrase(diseno.frase)
  const esc = cajas.escena
  const condicion = diseno.condicion
  const m = cajas.modelo

  return (
    <div style={lienzo(p, base.fondo)}>
      <svg width={layout.ancho} height={layout.alto} viewBox={`0 0 ${layout.ancho} ${layout.alto}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {diagonales(layout.ancho, layout.alto).map((x, i) => (
          <path key={i} d={x.d} fill={acento.hex} opacity={x.opacidad} />
        ))}
      </svg>

      {/* La escena se funde con el azul por los cuatro bordes */}
      <EscenaFundida src={p.escenaSrc} caja={esc} />

      {recursos.logo999 ? <Logo src={recursos.logo999} caja={cajas.logo999} /> : null}
      {recursos.logoMarca ? <Logo src={recursos.logoMarca} caja={cajas.logoMarca} /> : null}

      {/* Modelo: copia en contorno de acento detrás y, encima, el panel blanco inclinado con el nombre */}
      <div
        style={enCaja({ x: m.x + 10, y: m.y + 10, w: m.w, h: m.h }, { alignItems: 'center', justifyContent: 'center', fontFamily: f['archivo-expanded'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.modelo.tam, lineHeight: 1.1, color: 'transparent', textTransform: 'uppercase', WebkitTextStroke: `3px ${acento.hex}` })}
      >
        {textos.modelo.trim()}
      </div>
      <div style={enCaja(m, { backgroundColor: BLANCO, transform: `skewX(${INCLINACION}deg)` })} />
      <div style={enCaja(m, { alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: f['archivo-expanded'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.modelo.tam, lineHeight: 1.1, color: base.fondo, textTransform: 'uppercase' })}>
        {textos.modelo.trim()}
      </div>

      {/* Frase en dos colores */}
      {ajuste.frase.lineas > 0 ? (
        <div style={enCaja(cajas.frase, { flexDirection: 'column', justifyContent: 'center', fontFamily: f['archivo-expanded'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.frase.tam, lineHeight: 1.1, textTransform: 'uppercase' })}>
          <div style={{ display: 'flex', color: BLANCO }}>{primera}</div>
          {segunda ? <div style={{ display: 'flex', color: acento.hex }}>{segunda}</div> : null}
        </div>
      ) : null}

      {/* Precio en una barra inclinada */}
      <div style={enCaja(cajas.precio, { alignItems: 'center', justifyContent: 'center', backgroundColor: acento.hex, transform: `skewX(${INCLINACION}deg)` })} />
      <div style={enCaja(cajas.precio, { alignItems: 'center', justifyContent: 'center', fontFamily: f['archivo-expanded'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.precio.tam, lineHeight: 1.1, color: acento.sobre })}>{ajuste.textoPrecio}</div>

      {ajuste.filasCondicion > 0 ? (
        <div style={enCaja(cajas.condicion, { flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' })}>
          {condicion.texto ? <div style={{ display: 'flex', fontFamily: f['barlow-condensed'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.condicionTam, lineHeight: 1.1, color: BLANCO, textTransform: 'uppercase' }}>{condicion.texto}</div> : null}
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
