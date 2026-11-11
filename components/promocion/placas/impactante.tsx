/**
 * Plantilla "Impactante": fondo casi negro con textura grunge y pinceladas de color, el logo 999 arriba,
 * el modelo gigante con raspado, la moto en el centro, frase manuscrita rotada, precio, condición y pie.
 * Todo sale de las cajas del layout (lib/promocion/diseno/layouts.ts) y de los tamaños ya calculados.
 */

import { pinceladas } from '@/lib/promocion/diseno/decorados'
import { colorDe, BASE, BLANCO } from '@/lib/promocion/diseno/paletas'
import { enCaja, EscenaFundida, ImagenCompleta, lienzo, Logo, LogoConcesionaria, Pastilla, Pin } from './comun'
import type { PropsPlacaDiseno } from './tipos'

/** Semilla fija: la placa es reproducible (el hash no depende del azar). */
const SEMILLA = 20261110

export function PlacaImpactante(p: PropsPlacaDiseno) {
  const { layout, ajuste, recursos, familias, textos, diseno } = p
  const { cajas } = layout
  const base = BASE.impactante_textura
  const acento = colorDe('impactante_textura', diseno.acento)
  const f = familias

  const sobreEscena = cajas.escena
  const hayFrase = ajuste.frase.lineas > 0
  const condicion = diseno.condicion

  return (
    <div style={lienzo(p, base.fondo)}>
      {recursos.textura ? <ImagenCompleta src={recursos.textura} caja={{ x: 0, y: 0, w: layout.ancho, h: layout.alto }} /> : null}

      <svg width={layout.ancho} height={layout.alto} viewBox={`0 0 ${layout.ancho} ${layout.alto}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {pinceladas(layout.ancho, layout.alto, SEMILLA).map((x, i) => (
          <path key={i} d={x.d} fill={acento.hex} opacity={x.opacidad} />
        ))}
      </svg>

      {/* La escena se funde con el fondo negro por los cuatro bordes */}
      <EscenaFundida src={p.escenaSrc} caja={sobreEscena} />

      {/* Fila de logos: el 999 siempre arriba, con dos líneas de acento */}
      {recursos.logo999 ? <Logo src={recursos.logo999} caja={cajas.logo999} /> : null}
      <div style={enCaja({ x: cajas.logo999.x + cajas.logo999.w + 24, y: cajas.logo999.y + cajas.logo999.h / 2 - 12, w: Math.max(0, (recursos.logoMarca ? cajas.logoMarca.x : layout.ancho - 48) - (cajas.logo999.x + cajas.logo999.w) - 48), h: 8 }, { backgroundColor: acento.hex, transform: 'skewX(-30deg)' })} />
      <div style={enCaja({ x: cajas.logo999.x + cajas.logo999.w + 24, y: cajas.logo999.y + cajas.logo999.h / 2 + 4, w: Math.max(0, (recursos.logoMarca ? cajas.logoMarca.x : layout.ancho - 48) - (cajas.logo999.x + cajas.logo999.w) - 48) * 0.6, h: 8 }, { backgroundColor: acento.hex, transform: 'skewX(-30deg)' })} />
      {recursos.logoMarca ? <Logo src={recursos.logoMarca} caja={cajas.logoMarca} /> : null}

      {/* Modelo gigante, con el raspado del color del fondo encima */}
      <div
        style={enCaja(cajas.modelo, {
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontFamily: f.anton,
          fontWeight: 400,
          fontSize: ajuste.modelo.tam,
          lineHeight: 1.15,
          color: base.texto,
          textTransform: 'uppercase',
        })}
      >
        {textos.modelo.trim()}
      </div>
      {recursos.raspado ? <ImagenCompleta src={recursos.raspado} caja={cajas.modelo} ajuste="fill" /> : null}

      {/* Frase manuscrita, rotada */}
      {hayFrase ? (
        <div style={enCaja(cajas.frase, { alignItems: 'center', justifyContent: 'flex-start', fontFamily: f.kaushan, fontWeight: 400, fontSize: ajuste.frase.tam, lineHeight: 1.25, color: acento.hex, transform: 'rotate(-8deg)' })}>{diseno.frase}</div>
      ) : null}

      {/* Precio */}
      <div style={enCaja(cajas.precio, { alignItems: 'center', fontFamily: f.anton, fontWeight: 400, fontSize: ajuste.precio.tam, lineHeight: 1.15, color: base.texto })}>{ajuste.textoPrecio}</div>

      {/* Condición: texto blanco y, debajo, el destacado en una pastilla de acento */}
      {ajuste.filasCondicion > 0 ? (
        <div style={enCaja(cajas.condicion, { flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' })}>
          {condicion.texto ? (
            <div style={{ display: 'flex', fontFamily: f['barlow-condensed'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.condicionTam, lineHeight: 1.1, color: BLANCO, textTransform: 'uppercase' }}>{condicion.texto}</div>
          ) : null}
          {condicion.destacado ? (
            <Pastilla fondo={acento.hex} color={acento.sobre} tam={ajuste.condicionTam} familia={f['barlow-condensed']}>
              {condicion.destacado}
            </Pastilla>
          ) : null}
        </div>
      ) : null}

      {/* Pie: pastilla del CTA | pin + lugar */}
      <div style={enCaja(cajas.pie, { alignItems: 'center', justifyContent: 'space-between' })}>
        <Pastilla fondo={acento.hex} color={acento.sobre} tam={ajuste.ctaTam} familia={f['barlow-condensed']}>
          {diseno.cta}
        </Pastilla>
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: f['barlow-condensed'], fontWeight: 800, fontStyle: 'italic', fontSize: ajuste.lugarTam, color: BLANCO, textTransform: 'uppercase' }}>
          <Pin tam={Math.round(ajuste.lugarTam * 1.2)} color={acento.hex} />
          <div style={{ display: 'flex', marginLeft: 8 }}>{textos.lugar.trim()}</div>
        </div>
      </div>

      <LogoConcesionaria p={p} color={BLANCO} familia={f.anton} />
    </div>
  )
}
