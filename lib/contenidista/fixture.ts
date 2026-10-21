import type { Plan } from '../estratega/tipos.ts'
import type { ContextoSemana, Pieza } from './tipos.ts'

/** Un plan válido para los tests del Contenidista (semana 1 pide 4 piezas). */
export const planDePrueba = (): Plan => ({
  objetivo: 'Subir consultas por mensaje',
  mensajeCentral: 'Probá la Zontes este mes',
  publico: { descripcion: 'Hombres de 25 a 40 de Quilmes', segmentos: [] },
  marcas: ['999motos', 'Suzuki Quilmes'],
  presupuesto: { montoArs: 300000, nivel: 'campania', nota: null },
  ventana: { desde: '2026-11-02', hasta: '2026-11-29' },
  canales: [
    { plataforma: 'instagram', formatos: ['reel', 'imagen', 'historia', 'carrusel'], porcentaje: 70, porque: 'Mejores vistas' },
    { plataforma: 'facebook', formatos: ['imagen'], porcentaje: 30, porque: 'Comentarios' },
  ],
  calendario: [
    {
      semana: 1,
      eje: 'Lanzamiento',
      piezas: [
        { plataforma: 'instagram', formato: 'reel', cantidad: 1, idea: 'Recorrido por el taller' },
        { plataforma: 'instagram', formato: 'imagen', cantidad: 2, idea: 'Foto de la moto de la semana' },
        { plataforma: 'facebook', formato: 'imagen', cantidad: 1, idea: 'Post de financiación' },
      ],
    },
    { semana: 2, eje: 'Seguimiento', piezas: [{ plataforma: 'instagram', formato: 'historia', cantidad: 3, idea: 'Encuesta' }] },
  ],
  kpis: [],
  fundamentos: ['"3000 vistas"'],
  supuestos: [],
})

export const FUENTE_DE_PRUEBA = 'Financiación en 12 cuotas. Contado $ 1.500.000. Bonificación del 10%.'

export const contextoDePrueba = (o: Partial<ContextoSemana> = {}): ContextoSemana => ({
  plan: planDePrueba(),
  semana: 1,
  desde: '2026-11-02',
  hasta: '2026-11-08',
  fuente: FUENTE_DE_PRUEBA,
  ...o,
})

const base = {
  marca: '999motos',
  fecha: '2026-11-03',
  hook: 'Mirá cómo nace una moto',
  cta: 'Escribinos por DM',
  briefVisual: 'Plano general del taller',
} as const

/** Las 4 piezas que pide la semana 1 de planDePrueba, válidas. */
export const piezasDePrueba = (): Pieza[] => [
  { ...base, plataforma: 'instagram', formato: 'reel', copy: 'Así se arma una moto.', hashtags: ['#motos', '#quilmes'], guion: '1. Se ve el taller. Se dice: mirá.', altText: null, ideaOrigen: 'Recorrido por el taller' },
  { ...base, plataforma: 'instagram', formato: 'imagen', fecha: '2026-11-04', copy: 'La moto de la semana.', hashtags: ['#motos'], guion: null, altText: 'Una moto roja en el salón', ideaOrigen: 'Foto de la moto de la semana' },
  { ...base, plataforma: 'instagram', formato: 'imagen', fecha: '2026-11-05', copy: 'Otra mirada a la moto de la semana.', hashtags: ['#motos'], guion: null, altText: 'Una moto negra de perfil', ideaOrigen: 'Foto de la moto de la semana' },
  { ...base, plataforma: 'facebook', formato: 'imagen', fecha: '2026-11-06', copy: 'Financiá en 12 cuotas.', hashtags: [], guion: null, altText: 'Cartel de financiación', ideaOrigen: 'Post de financiación' },
]
