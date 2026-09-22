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
