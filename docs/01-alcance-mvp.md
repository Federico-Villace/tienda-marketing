# 01 · Alcance del MVP

> Documento de borde. Lo que no está acá, no está en el MVP.
> Fecha: 22 de septiembre de 2026.

## El objetivo del MVP, en una frase

Que Julián entre a una web, vea **sus propios datos reales** de Instagram,
Facebook y sus campañas publicitarias, y reciba **un análisis escrito por un
agente** sobre qué le funcionó y qué no.

Nada más. Sin generación de imágenes, sin videos, sin publicar.

## Por qué ese recorte y no otro

Porque es el único recorte que cumple las tres condiciones a la vez:

1. **Demuestra valor real el primer día.** Julián ve sus datos ordenados en un
   lugar que hoy no existe.
2. **No gasta plata en generación.** Todo el MVP corre con texto. El gasto total
   de IA del mes entero son centavos.
3. **Construye el cimiento obligatorio.** Las fases 2 a 5 (contenido, creativos,
   publicación) leen de la base de datos que arma esta fase. Sin ingesta no hay
   nada que analizar, y sin análisis no hay de dónde sacar una idea de campaña.

Arrancar por la generación de creativos sería construir el techo antes que los
cimientos: lindo para la demo, inservible a la semana.

## Entra en el MVP

| # | Funcionalidad | Detalle |
|---|---|---|
| 1 | Login | Supabase Auth, email + contraseña. Un solo usuario en el MVP. |
| 2 | Conexión a Meta | Token de system user en variable de entorno. **Sin flujo OAuth todavía.** |
| 3 | Ingesta orgánica | Publicaciones de IG y FB con sus métricas, a Postgres. |
| 4 | Ingesta de publicidad | Campañas y métricas vía MCP oficial de Meta Ads. |
| 5 | Sincronización programada | Un cron diario. Botón manual de "sincronizar ahora". |
| 6 | Tablero | Lista de publicaciones ordenables por métrica + resumen de campañas. |
| 7 | Agente Analista | Un agente. Lee de la BDD, devuelve análisis en texto. Resultado cacheado. |
| 8 | Registro de costos | Cada llamada a un modelo escribe su costo en `analisis`. Visible en pantalla. |

## NO entra en el MVP

Esto no es "nunca". Es "no ahora", y cada cosa tiene su fase asignada.

| Queda afuera | Vuelve en |
|---|---|
| Generación de imágenes y videos | Fase 3 |
| Subir una foto y recibir opciones con precio | Fase 3 |
| Los otros 3 agentes (Estratega, Contenidista, Productor) | Fases 2 y 3 |
| Publicar en Instagram o Facebook | Fase 4 |
| Editor de publicaciones antes de publicar | Fase 4 |
| Flujo OAuth para conectar cuentas de terceros | Fase 4 |
| Multi-tenant real (varias organizaciones) | Fase 4 |
| Conexión al CRM de 999 Motos | Fase 5 — **no se promete hasta relevar si tiene API** |
| TikTok, LinkedIn, WhatsApp | Sin fecha |

## Las cinco fases

```
Fase 0  Auditoría de accesos         ← bloqueante, 2 días
Fase 1  Ingesta + tablero + Analista ← EL MVP
Fase 2  Estratega + Contenidista       (solo texto, sigue siendo barato)
Fase 3  Productor + compuerta de costo (acá empieza a costar plata)
Fase 4  Publicación con aprobación     (acá pega Meta App Review si hace falta)
Fase 5  CRM de 999 Motos               (sin relevar todavía)
```

## Condición de salida del MVP

El MVP está terminado cuando Julián puede, sin ayuda:

- [x] Entrar con su usuario y contraseña. *(ADR-015)*
- [x] Ver sus publicaciones reales de los últimos 90 días con métricas reales. *(ADR-016)*
- [x] Ver sus campañas publicitarias con gasto y resultados reales. *(ADR-014)*
- [x] Apretar un botón y recibir un análisis escrito de ese período. *(ADR-017)*
- [x] Ver cuánto costó ese análisis, en dólares, en pantalla. *(ADR-017)*

> Los cinco puntos se probaron en producción el 20-oct-2026 con el usuario de
> Federico. Falta la prueba de cierre: que Julián lo haga **sin ayuda**, con su
> propio usuario (`docs/08`, sección "Dar acceso a otra persona").

Si alguno de esos cinco puntos no se cumple, el MVP no está terminado.
Si se cumplen los cinco, no se agrega nada más: se pasa a la fase 2.

## Acuerdo comercial

Las partes A y B de la propuesta `2026-001` (plugin local USD 300 + migración
del e-commerce USD 400) quedan **sin cargo** por decisión de Federico: Julián es
cliente de confianza con trabajo recurrente previsto.

Que sea sin cargo no cambia el alcance. Este documento es el borde de lo que se
entrega en esta etapa; lo que aparezca fuera de esta lista se conversa y se
planifica como fase nueva, no se agrega sobre la marcha.

## Pedidos de Julián (20-oct-2026)

Backlog que surgió de la revisión del tablero. Nada de esto entra sobre la
marcha: cada punto queda en su fase y se planifica ahí.

### Fase 1 (pendientes)

- [x] **Calendario** para filtrar por fecha y por cuenta (IG/FB dentro de cada
  marca). *(Hecho el 20-oct: ADR-017. La publicidad solo filtra por fechas.)*
- [x] **Mensajes recibidos como conversión en orgánico.** Requiere sondeo previo.
  Solo se **cuentan**; nunca se lee el contenido de los mensajes. *(Hecho el
  21-oct: ADR-020. Por cuenta y período, no por publicación: Meta no informa qué
  publicación originó cada mensaje. Falta sumarlo al payload del Analista.)*
- [x] **Botón para actualizar estadísticas**, con límite (por ejemplo, 1 cada 15
  minutos) para no gastar cuota de la API de Meta. *(Hecho el 23-oct: ADR-019.
  Límite de 15 minutos leyendo `sincronizaciones`.)*

### Fase 2

- [x] **Plan de campaña como propuesta**, con botones **OK** / **Editar**.
  *(Hecho el 22-oct: ADR-018. El presupuesto y los públicos son propuesta; no se
  ejecuta nada en Meta.)*
- [x] **Contenidista: piezas de texto con OK / Editar / Descartar** por semana de
  un plan aprobado, con versiones y contadores de los límites de Meta. *(Hecho el
  21-oct: ADR-021. No genera imágenes ni videos —fase 3— ni publica —fase 4.)*
- [ ] En **todos los agentes**, poder **editar las propuestas de las instancias
  anteriores**. *(Hecho para el Estratega, con versiones: ADR-018, y para el
  Contenidista: ADR-021. Falta solo el Analista.)*

### Fase 3

- [x] **Productor: imágenes desde una pieza aprobada**, con estimación, "Confirmar
  US$ X", tope mensual y costo real. *(Parcial, hecho el 21-oct: ADR-022. Solo
  imágenes (Nano Banana 2.1 y Gemini 3 Pro Image) de piezas imagen, carrusel e
  historia; se elige una por pieza.)*
- [ ] **Productor: subir una foto** y recibir un menú de opciones con precio.
  *(Próximo cambio: `productor-foto`. Hay que resolver el upload directo a Storage
  por el límite de 4,5 MB de Vercel y los derechos sobre la foto.)*
- [ ] **Productor: video.** *(Cambio aparte: Veo 3.1 se apaga el 22-oct-2026; el
  reemplazo, Gemini Omni 1.1 Flash, cuesta ~US$ 0,10 por segundo.)*

### Fase 3 / 4 — pregunta abierta para Julián

- [ ] ¿El **presupuesto** se define **por campaña** o **por grupo de anuncios**,
  y en qué **ventana de tiempo** se muestra el anuncio?

### Fase 4

- [ ] **Log de cada publicación** con éxito o falla y **en qué paso falló**
  (creación del contenedor o publicación).

### Sin fase / a discutir

- [ ] **Públicos específicos** (por ejemplo, una lista de mails cargada como
  Custom Audiences). Requiere el permiso `ads_management` (escritura) y trae
  temas de **privacidad de datos personales**.
