# 04 · Integración con Meta

> Verificado el 22 de septiembre de 2026. Meta rota versiones ~3 veces por año:
> revalidar esta página antes de cada fase.

## Dos caminos distintos, no uno

Esta es la confusión más cara del proyecto, así que va primero:

| Qué querés | Por dónde va | Cuánto cuesta construirlo |
|---|---|---|
| Leer campañas publicitarias | **MCP oficial de Meta Ads** | Casi nada. Meta lo hospeda. |
| Leer publicaciones orgánicas | Graph API | Código propio |
| Publicar en IG / FB | Graph API | Código propio + permisos |

## MCP oficial de Meta Ads

Meta lanzó el **29 de abril de 2026** su propio servidor MCP:

- **Endpoint:** `https://mcp.facebook.com/ads` (remoto, hospedado por Meta)
- **Auth:** OAuth de Meta Business. Sin app de developer, sin tokens que rotar.
- **Tools:** 29, en cinco áreas — reporting e insights, gestión de campañas,
  catálogo, diagnósticos de cuenta y datasets.
- **Precio:** gratis durante la beta abierta. Precio a futuro sin anunciar.

Toda la pregunta "¿tuvo campañas publicitarias y cómo le fue?" se responde con
esto, sin escribir integración. **No reescribir lo que Meta ya hospeda.**

⚠️ Riesgo a registrar: es beta y el precio futuro no está anunciado. Por eso la
capa 1 guarda todo en Postgres — si el MCP cambia de condiciones, los datos
históricos ya son nuestros y solo hay que reemplazar la fuente de ingesta.

## Graph API — versión y fechas que importan

| Dato | Valor |
|---|---|
| Versión vigente | **v26.0**, publicada el 29 de julio de 2026 |
| Versión a usar | v26.0 — configurable en `META_API_VERSION` |
| ⚠️ Fecha crítica | **27 de octubre de 2026**: los cambios que rompen de v26.0 pasan a aplicar a *todas* las versiones |
| Deprecación | v20.0 se deprecó el 24 de septiembre de 2026 |

**Lo que rompe y nos afecta:**

- `instagram_actor_id` → pasó a `instagram_user_id`.
- Las métricas legacy de alcance (`reach`, `impressions`) se retiraron en junio
  de 2026, reemplazadas por **Media Views** (`views`). Por eso el esquema tiene
  `vistas` como columna principal y deja `alcance`/`impresiones` como opcionales
  que pueden venir nulas.

No pinear la versión en cada llamada es garantía de que la app se rompa sola un
martes a la mañana. Va en variable de entorno, en un solo lugar.

## Permisos

La app de Julián **ya tiene App Review aprobado**, así que nos ahorramos 2 a 4
semanas de calendario. Lo que falta es confirmar **qué permisos exactos** trae.

| Permiso | Para qué | ¿MVP? |
|---|---|---|
| `instagram_basic` | Leer perfil y publicaciones de IG | ✅ |
| `instagram_manage_insights` | Métricas orgánicas de IG | ✅ |
| `pages_read_engagement` | Leer publicaciones y métricas de FB | ✅ |
| `ads_read` | Leer campañas e insights de publicidad | ✅ |
| `business_management` | Listar los activos del Business Manager | ✅ |
| `pages_manage_posts` | Publicar en FB | Fase 4 |
| `instagram_business_content_publish` | Publicar en IG | Fase 4 |
| `ads_management` | **Crear o modificar** campañas | No planificado |

> `ads_management` no se pide. Leer publicidad es `ads_read`. Pedir permiso de
> escritura sobre el presupuesto publicitario de un cliente sin necesitarlo es
> exponerse a un accidente caro.

## Verificación de accesos — fase 0, bloqueante

Antes de escribir una línea de ingesta hay que saber qué trae el token. El script
está en [`scripts/verificar-permisos-meta.sh`](../scripts/verificar-permisos-meta.sh).

```bash
cp env.example .env.local   # completar con los valores que pase Julián
./scripts/verificar-permisos-meta.sh
```

Tres campos de la respuesta deciden el diseño:

| Campo | Qué querés ver | Si no |
|---|---|---|
| `type` | `SYSTEM_USER` | Si es `USER`, expira y hay que resolver renovación |
| `expires_at` | `0` (no expira) | Si dice 60 días, hace falta refresco programado |
| `scopes` | Los cinco del MVP | Lo que falte hay que pedirlo y puede requerir review nuevo |

## Endpoints del MVP

```
GET /v26.0/{ig-user-id}/media
    ?fields=id,caption,media_type,media_url,permalink,timestamp

GET /v26.0/{ig-media-id}/insights
    ?metric=views,likes,comments,shares,saved

GET /v26.0/{page-id}/posts
    ?fields=id,message,permalink_url,created_time

GET /v26.0/act_{ad-account-id}/insights
    ?level=campaign&time_increment=1
    &fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions
```

`time_increment=1` es el que da grano diario — el que permite recalcular
cualquier rango con un `sum()` en SQL en vez de una llamada nueva a Meta.

## Límites de tasa

- **Publicación:** 100 posts por API cada ventana móvil de 24 horas, por cuenta
  de IG. Un carrusel cuenta como uno. (Fase 4.)
- **Lectura:** límite por hora calculado sobre la app, no sobre el usuario. Es
  exactamente por esto que la ingesta corre en un cron diario y nunca a demanda:
  diez usuarios impacientes apretando "actualizar" agotan la cuota de la app
  entera.

## Publicación — fase 4, para tenerlo presente

Instagram publica en dos pasos, no en uno:

```
1) POST /v26.0/{ig-user-id}/media          → devuelve un creation_id (container)
2) POST /v26.0/{ig-user-id}/media_publish  → recibe creation_id, publica
```

El container tiene ventana de validez. Entre el paso 1 y el 2 es donde entra la
edición y la aprobación humana del flujo que pidió Federico.

## Fuentes

- [Ads MCP Server · Meta for Developers](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview)
- [Graph API · Versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)
- [Meta Ads MCP: Meta's Official Server, 29 Tools](https://www.usecarly.com/blog/meta-ads-mcp/)
- [Instagram Graph API en 2026: versiones, límites y publicación](https://www.netrows.com/blog/instagram-graph-api-guide-2026)

---

# La app del cliente

> Relevado el 24 de septiembre de 2026, desde el panel de developers de Julián.

| Dato | Valor |
|---|---|
| Nombre | **CRM 999 Motos** |
| App ID | `2324064161428607` |
| Business ID | `155769225183739` |
| Estado | **Published** (modo producción) |
| Producto configurado visible | Facebook Login for Business |

## Qué prueba y qué no prueba ese estado

**Published significa modo producción**, y que el negocio está verificado. No
significa que la app tenga los permisos que necesita este proyecto.

La app se llama *CRM* y el único producto visible es *Facebook Login for
Business*, que es autenticación. Es razonable esperar permisos del tipo
`pages_show_list`, `pages_messaging` o `business_management` — y **no**
`instagram_manage_insights` ni `ads_read`, que son los que necesita el MVP.

**Pendiente de confirmar (riesgo R1):** la pantalla *Use cases* del panel, que
lista cada caso de uso con sus permisos y el estado de cada uno.

## Dato útil: la verificación de negocio es por Business, no por app

El Business `155769225183739` ya está verificado. Si en algún momento conviene
crear una app separada para la plataforma de marketing —en vez de montarla sobre
la app del CRM— esa app hereda la verificación del negocio y solo necesita App
Review de sus propios permisos.

| Opción | A favor | En contra |
|---|---|---|
| Montar sobre la app del CRM | Más rápido si los permisos ya están | Acopla la plataforma de marketing a la app de un sistema en producción |
| App nueva bajo el mismo Business | Separación limpia, ciclos de review independientes | App Review propio de los permisos |

Decidir recién cuando se vea la pantalla *Use cases*: si los permisos del MVP ya
están, se monta sobre la del CRM; si hay que pedirlos igual, conviene la app
aparte.

> Pedir permisos nuevos sobre una app publicada **no revoca los que ya están
> aprobados** — los nuevos entran en review y los viejos siguen funcionando. El
> riesgo de tocar la app del CRM es de acoplamiento a futuro, no de caída.

## Cómo generar el token que sirve

El token del Graph API Explorer dura 1 hora. El que hay que usar es de **system
user**, y no se saca del panel de developers sino del Business Manager:

```
business.facebook.com → Configuración del negocio
  → Usuarios → Usuarios del sistema → Agregar (rol: admin)
  → Agregar activos: página de FB + cuenta de IG + cuenta publicitaria
  → Generar nuevo token → app: CRM 999 Motos
  → permisos: instagram_basic, instagram_manage_insights,
              pages_read_engagement, ads_read, business_management
```

Ese token no expira. Va directo a `.env.local` como `META_ACCESS_TOKEN`; no se
comparte por chat ni se commitea.

Después se verifica con `./scripts/verificar-permisos-meta.sh`, que además
descubre los IDs de página, cuenta de IG y cuenta publicitaria que faltan
completar en el `.env.local`.

## Permisos reales de la app — relevado el 24-sep-2026

Use case inspeccionado: **Create & manage ads** (`MARKETING_API_ADS_MANAGEMENT`).

| Permiso / feature | Llamadas | Estado | Sirve al MVP |
|---|---|---|---|
| `ads_read` | 141 | Ready for testing | ✅ sí |
| `ads_management` | 141 | Ready for testing | ✅ existe, **no se usa** |
| `catalog_management` | 1 | Ready for testing | ○ futuro |
| `pages_manage_ads` | 0 | Ready for testing | ○ no hace falta |
| `pages_read_engagement` | 633 | ⚠️ Verification required | ✅ sí |
| `business_management` | 717 | ⚠️ App Review rejected | ✅ sí (ver abajo) |
| Business Asset User Profile Access | 0 | ❌ App Review rejected | ○ no hace falta |
| Marketing API Access Tier | — | ⚠️ Limited access | ver cuotas |
| `email` | — | sin pedir | ○ no hace falta |
| **Cualquier permiso de Instagram** | — | **no aparece** | ❌ **falta** |

## El concepto que decide si hace falta App Review

Meta tiene dos niveles de acceso, no uno:

| Nivel | Alcance | ¿App Review? | Nombre en el panel |
|---|---|---|---|
| **Standard Access** | Datos del **propio negocio** y usuarios con rol en la app | **No** | *Ready for testing* |
| **Advanced Access** | Datos de **terceros** | **Sí** | *Advanced access* |

**Conclusión para el MVP: no hace falta App Review.** La app, el Business, la
página, la cuenta de IG y la cuenta publicitaria pertenecen todos al mismo
negocio (`155769225183739`), y el token va a ser de system user de ese Business.
Standard Access cubre exactamente ese caso.

**La evidencia de que esto es así y no una interpretación optimista:**
`business_management` figura como *App Review rejected* y sin embargo registra
**717 llamadas exitosas**. Lo rechazado fue el **Advanced** Access; el Standard
sigue funcionando sobre los activos propios. Lo mismo con `pages_read_engagement`
(633 llamadas) y `ads_read` (141).

> ⚠️ Esto vale **solo** mientras el producto opere sobre los activos de Julián.
> El día que se venda como servicio a terceros hace falta Advanced Access y App
> Review — y a esta app ya le rechazaron un pedido de Advanced Access antes.
> Refuerza el riesgo R6: conviene app separada para la plataforma de marketing.

## Cuotas del Marketing API — tier "Limited access"

*Limited access* es el tier de desarrollo:

| | Development (actual) | Standard |
|---|---|---|
| Puntos de cuota | **60** por ventana de 300 s | 9.000 |
| Costo por lectura | 1 punto | 1 punto |
| Costo por escritura | 3 puntos | 3 puntos |
| Cuentas publicitarias | sin límite | sin límite |

Sesenta lecturas cada cinco minutos alcanza de sobra para la ingesta diaria de
una sola cuenta. **Condición de diseño para el cron:** paginar de a poco y tener
retroceso exponencial ante un `error 17` / `4` (límite de cuota). Nunca disparar
la ingesta completa en ráfaga.

**El MVP se gana el upgrade solo.** Para pasar a Standard hacen falta 500+
llamadas exitosas en los últimos 15 días con menos de 15% de error. La app lleva
141 de ads; una ingesta diaria genera ese volumen sin esfuerzo.

## Lo que falta confirmar

1. **Instagram.** El desplegable de *use cases* tiene más casos además de
   *Create & manage ads*. Los permisos de IG (`instagram_basic`,
   `instagram_manage_insights`) viven en otro. **Sin esto no hay mitad del MVP.**
2. **Qué pide "Verification required"** en `pages_read_engagement`. Revisar la
   pantalla *Required actions*.

## Fuentes de esta sección

- [Meta Advanced Access: qué permisos necesitan App Review](https://singhamandeep.com/what-is-meta-advanced-access/)
- [Facebook Ads API Permission App Review: guía 2026](https://singhamandeep.com/facebook-ads-api-permission-app-review/)
- [Update to Ads Management Standard Access (Meta)](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- [Meta Marketing API: tiers, cuotas y límites](https://www.get-ryze.ai/blog/meta-marketing-api-free-tier-limitations-and-quotas)
