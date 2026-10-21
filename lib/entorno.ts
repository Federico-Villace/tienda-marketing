/**
 * Revisión del entorno.
 *
 * La app tiene que levantar sin una sola variable configurada. En vez de
 * explotar en el arranque, informa qué falta y qué se destraba con cada cosa.
 *
 * Regla dura: acá nunca sale el VALOR de una variable, solo si está o no.
 */

export type Grupo = 'meta' | 'supabase' | 'ia' | 'cron'

export type Requisito = {
  readonly nombre: string
  readonly grupo: Grupo
  readonly obligatoria: boolean
  readonly descripcion: string
  /** Qué deja de funcionar si falta. */
  readonly destraba: string
}

export type EstadoVariable = Requisito & { readonly presente: boolean }

export type EstadoEntorno = {
  readonly variables: readonly EstadoVariable[]
  readonly faltantesObligatorias: readonly string[]
  readonly listo: boolean
}

export const REQUISITOS: readonly Requisito[] = [
  {
    nombre: 'META_APP_ID',
    grupo: 'meta',
    obligatoria: true,
    descripcion: 'ID de la app "CRM 999 Motos" en developers.facebook.com',
    destraba: 'Toda la ingesta de Meta',
  },
  {
    nombre: 'META_APP_SECRET',
    grupo: 'meta',
    obligatoria: true,
    descripcion: 'Clave secreta de la app. App settings → Basic',
    destraba: 'Verificación del token',
  },
  {
    nombre: 'META_ACCESS_TOKEN',
    grupo: 'meta',
    obligatoria: true,
    descripcion: 'Token de system user del Business Manager (no expira)',
    destraba: 'Toda la ingesta de Meta',
  },
  {
    nombre: 'META_CONFIG_ID',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'ID de la configuración de Facebook Login for Business. Fija los permisos del token',
    destraba: 'Conectar con Facebook desde Configuración (el token queda en Vault)',
  },
  {
    nombre: 'META_BUSINESS_ID',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'Business Manager del cliente. El login rechaza cuentas que no lo ven',
    destraba: 'Conectar con Facebook desde Configuración',
  },
  {
    nombre: 'META_API_VERSION',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'Versión de la Graph API a usar. Por defecto v26.0',
    destraba: 'Fijar la versión en vez de usar la que viene por defecto',
  },
  {
    nombre: 'META_AD_ACCOUNT_ID',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'Cuenta publicitaria, con el prefijo act_',
    destraba: 'Ingesta de campañas publicitarias',
  },
  {
    nombre: 'IG_BUSINESS_ACCOUNT_ID',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'Cuenta de Instagram profesional vinculada a la página',
    destraba: 'Ingesta de publicaciones de Instagram',
  },
  {
    nombre: 'FB_PAGE_ID',
    grupo: 'meta',
    obligatoria: false,
    descripcion: 'Página de Facebook del negocio',
    destraba: 'Ingesta de publicaciones de Facebook',
  },
  {
    nombre: 'NEXT_PUBLIC_SUPABASE_URL',
    grupo: 'supabase',
    obligatoria: true,
    descripcion: 'URL del proyecto de Supabase',
    destraba: 'Login y persistencia',
  },
  {
    nombre: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    grupo: 'supabase',
    obligatoria: true,
    descripcion: 'Clave publicable (sb_publishable_…). Pública por diseño, la protege RLS',
    destraba: 'Login y lectura desde el navegador',
  },
  {
    nombre: 'SUPABASE_SECRET_KEY',
    grupo: 'supabase',
    obligatoria: true,
    descripcion: 'Clave secreta (sb_secret_…). Saltea RLS: solo servidor',
    destraba: 'Escritura de la ingesta',
  },
  {
    nombre: 'OPENAI_API_KEY',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Clave de la API de OpenAI',
    destraba: 'Los agentes Analista, Estratega y Contenidista',
  },
  {
    nombre: 'MODELO_ANALISTA',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Modelo del Analista. Por defecto gpt-6-luna',
    destraba: 'Elegir un modelo distinto al de por defecto',
  },
  {
    nombre: 'MODELO_ESTRATEGA',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Modelo del Estratega. Por defecto gpt-6-luna',
    destraba: 'Elegir un modelo distinto al de por defecto',
  },
  {
    nombre: 'MODELO_CONTENIDISTA',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Modelo del Contenidista. Por defecto gpt-6-luna',
    destraba: 'Elegir un modelo distinto al de por defecto',
  },
  {
    nombre: 'GEMINI_API_KEY',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Clave de la Gemini API (Google AI Studio)',
    destraba: 'El Productor: generar imágenes',
  },
  {
    nombre: 'PRESUPUESTO_MENSUAL_USD',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Tope de gasto mensual en imágenes, en US$. Vacío = Productor apagado',
    destraba: 'El Productor: sin tope no se gasta nada',
  },
  {
    nombre: 'MODELO_IMAGEN',
    grupo: 'ia',
    obligatoria: false,
    descripcion: 'Motor de imagen por defecto. Vacío = gemini-nano-banana-2.1',
    destraba: 'Elegir un motor distinto al de por defecto',
  },
  {
    nombre: 'CRON_SECRET',
    grupo: 'cron',
    obligatoria: false,
    descripcion: 'Secreto propio para que el endpoint de sync no sea público',
    destraba: 'Sincronización programada en producción',
  },
]

/** Una variable definida pero vacía (o en blanco) cuenta como ausente. */
const tieneValor = (valor: string | undefined): boolean =>
  typeof valor === 'string' && valor.trim().length > 0

export function revisarEntorno(
  fuente: Record<string, string | undefined>,
): EstadoEntorno {
  const variables = REQUISITOS.map((requisito) => ({
    ...requisito,
    presente: tieneValor(fuente[requisito.nombre]),
  }))

  const faltantesObligatorias = variables
    .filter((v) => v.obligatoria && !v.presente)
    .map((v) => v.nombre)

  return {
    variables,
    faltantesObligatorias,
    listo: faltantesObligatorias.length === 0,
  }
}

/** Atajo para el servidor. Nunca llamar desde un componente de cliente. */
export const revisarEntornoDelProceso = (): EstadoEntorno =>
  revisarEntorno(process.env as Record<string, string | undefined>)

export const ETIQUETAS_GRUPO: Record<Grupo, string> = {
  meta: 'Meta',
  supabase: 'Supabase',
  ia: 'Modelos de IA',
  cron: 'Sincronización',
}
