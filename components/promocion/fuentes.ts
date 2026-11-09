import localFont from 'next/font/local'

/**
 * Las MISMAS fuentes que usa el servidor para dibujar el PNG final (assets/fuentes,
 * licencia OFL), cargadas para el navegador: así la vista previa se parece a lo que sale.
 * Solo se las pide la pantalla de promociones: sin precarga en el resto del sitio.
 */
export const anton = localFont({ src: '../../assets/fuentes/Anton-Regular.ttf', weight: '400', variable: '--font-anton', display: 'swap', preload: false })
export const inter = localFont({ src: '../../assets/fuentes/Inter-SemiBold.otf', weight: '600', variable: '--font-inter', display: 'swap', preload: false })

// Las de las plantillas de diseño (ADR-038). Una por archivo; con preload apagado el navegador
// solo baja la que la pantalla usa.
export const kaushan = localFont({ src: '../../assets/fuentes/KaushanScript-Regular.ttf', weight: '400', variable: '--font-kaushan', display: 'swap', preload: false })
export const barlowCondensed = localFont({ src: '../../assets/fuentes/BarlowCondensed-ExtraBoldItalic.ttf', weight: '800', style: 'italic', variable: '--font-barlow', display: 'swap', preload: false })
export const archivoExpanded = localFont({ src: '../../assets/fuentes/Archivo_Expanded-ExtraBoldItalic.ttf', weight: '800', style: 'italic', variable: '--font-archivo', display: 'swap', preload: false })
export const soraExtraBold = localFont({ src: '../../assets/fuentes/Sora-ExtraBold.ttf', weight: '800', variable: '--font-sora-800', display: 'swap', preload: false })
export const soraSemiBold = localFont({ src: '../../assets/fuentes/Sora-SemiBold.ttf', weight: '600', variable: '--font-sora-600', display: 'swap', preload: false })

/** Las clases que hay que poner en el contenedor de la pantalla para que existan las variables CSS. */
export const VARIABLES_FUENTES = [anton, inter, kaushan, barlowCondensed, archivoExpanded, soraExtraBold, soraSemiBold].map((f) => f.variable).join(' ')

/** Nombres de familia para <Placa> en el navegador (las variables CSS que crea next/font). */
export const FUENTES_NAVEGADOR = { titulo: 'var(--font-anton), Anton, Impact, sans-serif', texto: 'var(--font-inter), Inter, system-ui, sans-serif' } as const

/**
 * Familias de las plantillas de diseño en el navegador, por id de fuente (lib/promocion/fuentes-placa.ts).
 * Sora tiene dos pesos: son dos variables, porque con next/font cada archivo es su propia familia.
 */
export const FAMILIAS_DISENO_NAVEGADOR = {
  anton: 'var(--font-anton), Anton, Impact, sans-serif',
  inter: 'var(--font-inter), Inter, system-ui, sans-serif',
  kaushan: "var(--font-kaushan), 'Kaushan Script', cursive",
  'barlow-condensed': "var(--font-barlow), 'Barlow Condensed', sans-serif",
  'archivo-expanded': "var(--font-archivo), 'Archivo Expanded', sans-serif",
  'sora-extrabold': "var(--font-sora-800), Sora, sans-serif",
  'sora-semibold': "var(--font-sora-600), Sora, sans-serif",
} as const
