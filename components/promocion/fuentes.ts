import localFont from 'next/font/local'

/**
 * Las MISMAS dos fuentes que usa el servidor para dibujar el PNG final (assets/fuentes,
 * licencia OFL), cargadas para el navegador: así la vista previa se parece a lo que sale.
 * Solo se las pide la pantalla de promociones: sin precarga en el resto del sitio.
 */
export const anton = localFont({ src: '../../assets/fuentes/Anton-Regular.ttf', weight: '400', variable: '--font-anton', display: 'swap', preload: false })
export const inter = localFont({ src: '../../assets/fuentes/Inter-SemiBold.otf', weight: '600', variable: '--font-inter', display: 'swap', preload: false })

/** Nombres de familia para <Placa> en el navegador (las variables CSS que crea next/font). */
export const FUENTES_NAVEGADOR = { titulo: 'var(--font-anton), Anton, Impact, sans-serif', texto: 'var(--font-inter), Inter, system-ui, sans-serif' } as const
