/**
 * Texturas de la plantilla "impactante": se generan con código (PRNG con semilla, sin dependencias ni
 * red) y se commitean como PNG de gris+alfa. Son decorado: la placa las pone encima del fondo.
 * `scripts/generar-texturas.ts` las escribe en assets/texturas; un test comprueba que el PNG
 * commiteado es exactamente lo que genera este código.
 */

import { crc32, deflateSync } from 'node:zlib'

/** mulberry32: determinista, rápido y alcanza para ruido visual. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const trozo = (tipo: string, datos: Uint8Array): Buffer => {
  const t = Buffer.from(tipo, 'latin1')
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])))
  return Buffer.concat([largo, t, Buffer.from(datos), crc])
}

/** PNG de 8 bits, gris + alfa (color type 4). `pixeles` = 2 bytes por píxel (gris, alfa), fila por fila. */
export function codificarPng(ancho: number, alto: number, pixeles: Uint8Array): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8
  ihdr[9] = 4
  const fila = ancho * 2
  const crudo = Buffer.alloc((fila + 1) * alto)
  for (let y = 0; y < alto; y++) {
    crudo[y * (fila + 1)] = 0 // filtro "none"
    Buffer.from(pixeles.buffer, pixeles.byteOffset + y * fila, fila).copy(crudo, y * (fila + 1) + 1)
  }
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo, { level: 9 })), trozo('IEND', new Uint8Array())]),
  )
}

/** Ruido de valor: una grilla chica interpolada (manchas suaves). */
function ruidoSuave(ancho: number, alto: number, celda: number, azar: () => number): (x: number, y: number) => number {
  const gw = Math.ceil(ancho / celda) + 2
  const gh = Math.ceil(alto / celda) + 2
  const g = Float32Array.from({ length: gw * gh }, () => azar())
  const suave = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const fx = x / celda
    const fy = y / celda
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = suave(fx - x0)
    const ty = suave(fy - y0)
    const a = g[y0 * gw + x0]!
    const b = g[y0 * gw + x0 + 1]!
    const c = g[(y0 + 1) * gw + x0]!
    const d = g[(y0 + 1) * gw + x0 + 1]!
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
  }
}

const limitar = (x: number) => Math.max(0, Math.min(255, Math.round(x)))

/**
 * Grunge: manchas claras y polvo sobre transparente. Se pone con poca opacidad sobre el fondo
 * casi negro para que no sea liso. Gris claro; el alfa lleva toda la información.
 */
export function generarGrunge(ancho: number, alto: number, semilla: number): Uint8Array {
  const azar = prng(semilla)
  const grande = ruidoSuave(ancho, alto, 260, azar)
  const medio = ruidoSuave(ancho, alto, 70, azar)
  const fino = ruidoSuave(ancho, alto, 9, azar)
  const px = new Uint8Array(ancho * alto * 2)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const mancha = grande(x, y) * 0.55 + medio(x, y) * 0.3 + fino(x, y) * 0.15
      // Solo las manchas más fuertes dejan marca: el resto queda transparente.
      let a = Math.max(0, mancha - 0.52) * 2.2
      const polvo = azar()
      if (polvo > 0.9965) a = Math.max(a, 0.55 + azar() * 0.4)
      else if (polvo > 0.985) a *= 1.4
      const i = (y * ancho + x) * 2
      px[i] = 232
      px[i + 1] = limitar(a * 150)
    }
  }
  // Rayones finos
  for (let n = 0; n < Math.round((ancho * alto) / 24000); n++) {
    let x = azar() * ancho
    let y = azar() * alto
    const ang = azar() * Math.PI
    const largo = 20 + azar() * 140
    const fuerza = 40 + azar() * 70
    for (let t = 0; t < largo; t++) {
      x += Math.cos(ang)
      y += Math.sin(ang)
      const xi = Math.round(x)
      const yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= ancho || yi >= alto) break
      const i = (yi * ancho + xi) * 2 + 1
      px[i] = Math.max(px[i]!, limitar(fuerza))
    }
  }
  return codificarPng(ancho, alto, px)
}

/**
 * Raspado: motas y rayones del COLOR DEL FONDO (casi negro) que se dibujan encima del texto del
 * modelo, para que parezca gastado. Sin blend modes: igual en el navegador y en satori.
 */
export function generarRaspado(ancho: number, alto: number, semilla: number): Uint8Array {
  const azar = prng(semilla)
  const manchas = ruidoSuave(ancho, alto, 22, azar)
  const px = new Uint8Array(ancho * alto * 2)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const m = manchas(x, y)
      let a = Math.max(0, m - 0.66) * 5
      if (azar() > 0.992) a = Math.max(a, 0.9)
      const i = (y * ancho + x) * 2
      px[i] = 11
      px[i + 1] = limitar(a * 255)
    }
  }
  for (let n = 0; n < Math.round((ancho * alto) / 5000); n++) {
    let x = azar() * ancho
    let y = azar() * alto
    const ang = -0.5 + azar() * 1
    const largo = 14 + azar() * 90
    const grosor = 1 + Math.floor(azar() * 3)
    for (let t = 0; t < largo; t++) {
      x += Math.cos(ang)
      y += Math.sin(ang)
      for (let k = 0; k < grosor; k++) {
        const xi = Math.round(x)
        const yi = Math.round(y) + k
        if (xi < 0 || yi < 0 || xi >= ancho || yi >= alto) continue
        px[(yi * ancho + xi) * 2 + 1] = 255
      }
    }
  }
  return codificarPng(ancho, alto, px)
}

/** Las texturas que usa la placa: nombre de archivo en assets/texturas, medidas y cómo se generan. */
export const TEXTURAS = {
  grunge: { archivo: 'grunge.png', ancho: 1080, alto: 1920, generar: () => generarGrunge(1080, 1920, 20261109) },
  raspado: { archivo: 'raspado.png', ancho: 1080, alto: 420, generar: () => generarRaspado(1080, 420, 20261110) },
} as const
