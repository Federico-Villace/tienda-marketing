# 07 · De dónde sale cada clave

Guía paso a paso. **Ordenada de más fácil a más trabada**: hacé los primeros
mientras esperás que Julián te destrabe los últimos.

```bash
cp env.example .env.local
```

Después de cada bloque, reiniciá `pnpm dev` y mirá cómo la home va marcando en
verde lo que sumaste.

> `.env.local` no se commitea nunca (está en `.gitignore`) y no se manda por
> chat ni por WhatsApp. Si una clave se filtra, se rota — no se tapa.

---

## 0 · `CRON_SECRET` — 10 segundos, lo generás vos

No se lo pedís a nadie. Es un secreto propio para que el endpoint de
sincronización no lo pueda disparar cualquiera desde internet.

```bash
openssl rand -hex 32
```

Pegá la salida en `CRON_SECRET`. Listo.

---

## 1 · Supabase — 5 minutos, gratis, **lo primero que importa**

Es la base de datos de todo el MVP: sin esto no hay ingesta, ni tablero, ni nada
que analizar. Plan gratuito alcanza y sobra para la fase 1.

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta.
2. **New project**. Nombre: `tienda-marketing-agentes`. Región: **South America
   (São Paulo)** — es la más cerca, menos latencia.
3. Guardá la contraseña de la base que te genera. No es ninguna de las variables
   de acá, pero la vas a necesitar para `supabase db push`.
4. Esperá ~2 minutos a que termine de aprovisionar.

Después, en el panel del proyecto: **Settings → API Keys**.

| Variable | Dónde está | Cómo se ve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys → pestaña *Publishable and secret* | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | misma pantalla, la secreta | `sb_secret_…` |

### ⚠️ Si ves claves que empiezan con `eyJ`, son las viejas

Supabase está **deprecando `anon` y `service_role` para fin de 2026**. Las nuevas
son cadenas cortas (`sb_publishable_…`, `sb_secret_…`), no JWT.

Si el panel te muestra las legacy, buscá la pestaña de las nuevas y usá esas.
Cualquier tutorial que te diga "copiá la clave larga que arranca con `eyJ`" está
escrito para el esquema viejo.

### La diferencia entre las dos, que importa

- **Publishable**: va al navegador, es pública por diseño. Lo que la protege es
  RLS, no el secreto. Por eso el esquema tiene RLS en todas las tablas.
- **Secret**: saltea RLS por completo. **Solo servidor.** Si se filtra, alguien
  lee y escribe toda la base. Como red de seguridad, Supabase le devuelve 401 si
  detecta que se usó desde un navegador — pero no confíes en eso, confiá en no
  filtrarla.

### Aplicar el esquema

```bash
supabase link --project-ref <REF>    # el REF está en la URL del panel
supabase db push
```

---

## 2 · Meta · `META_APP_ID` — ya lo tenés

```
META_APP_ID=2324064161428607
META_BUSINESS_ID=155769225183739
META_API_VERSION=v26.0
```

Ya vienen cargados en `env.example`. No hay que buscar nada.

---

## 3 · Meta · `META_APP_SECRET` — 2 minutos, **si tenés rol en la app**

```
developers.facebook.com → app "CRM 999 Motos"
  → App settings → Basic
  → App secret → botón "Show"  (te pide tu contraseña de Facebook)
```

### 🚧 El bloqueo probable

Esa pantalla solo la ve quien tiene rol de **Administrador** en la app. Si
entrás y no la ves, pedile a Julián:

```
developers.facebook.com → app → App roles → Roles → Add people
  → Administrator → (tu cuenta de Facebook)
```

Aceptás la invitación desde tu propio Facebook y recién ahí aparece el secreto.

**Pedile el rol antes que la clave.** Con el rol te desbloqueás solo para todo lo
que sigue; sin el rol vas a tener que pedirle cada cosa de a una.

---

## 4 · Meta · `META_ACCESS_TOKEN` — 10 minutos, el más trabado

Este **no** sale del panel de developers. Sale del Business Manager, y es el que
más se equivoca la gente.

> ❌ El token del **Graph API Explorer** dura 1 hora. No sirve. Si lo usás, la
> ingesta te va a funcionar hoy y romperse mañana sin explicación.

```
business.facebook.com → Configuración del negocio
  → Usuarios → Usuarios del sistema
  → Agregar  (nombre: "ingesta-marketing", rol: Administrador)
```

Después, con ese usuario del sistema seleccionado:

**a) Asignarle los activos** — botón *Agregar activos*:

- La **página de Facebook** de 999 Motos → control total
- La **cuenta de Instagram** → control total
- La **cuenta publicitaria** → ver rendimiento (con eso alcanza para leer)

Sin este paso el token se genera igual pero no ve nada. Es el error más común.

**b) Generar el token** — botón *Generar nuevo token*:

- App: **CRM 999 Motos**
- Permisos a tildar:
  - `instagram_basic`
  - `instagram_manage_insights`
  - `pages_read_engagement`
  - `ads_read`
  - `business_management`

Copialo apenas aparece: **Meta no te lo muestra dos veces.** Si lo perdés,
generás otro.

Ese token no expira.

---

## 5 · Los tres IDs — los descubre el script

`META_AD_ACCOUNT_ID`, `IG_BUSINESS_ACCOUNT_ID` y `FB_PAGE_ID` no los busques a
mano. Con las claves de los pasos 3 y 4 cargadas:

```bash
./scripts/verificar-permisos-meta.sh
```

Te imprime los permisos reales del token, si expira o no, y la lista de páginas,
cuentas de IG y cuentas publicitarias con sus IDs. Copiás y pegás.

---

## 6 · `ANTHROPIC_API_KEY` — opcional, para la fase 1 tardía

Recién hace falta cuando conectemos el agente Analista. La ingesta y el tablero
andan sin esto.

```
console.anthropic.com → Settings → API keys → Create key
```

### ⚠️ La trampa que se come todo el mundo

**Tu suscripción a Claude (Pro o Max) NO incluye créditos de API.** Son dos
productos con facturación separada. En `console.anthropic.com` tenés que cargar
saldo aparte.

La buena noticia: para el MVP son centavos. El análisis corre con el modelo más
económico sobre agregados, no sobre datos crudos — el mes entero da menos de
USD 1. Cargá USD 5 y te dura meses.

`MODELO_ANALISTA` dejalo vacío: el código usa el económico por defecto.

---

## Resumen: qué te destraba cada cosa

| Bloque | Tiempo | Depende de | Qué destraba |
|---|---|---|---|
| `CRON_SECRET` | 10 s | vos | Sincronización programada |
| Supabase (3) | 5 min | vos | **Login, base de datos, todo** |
| `META_APP_SECRET` | 2 min | 🚧 rol que da Julián | Verificar el token |
| `META_ACCESS_TOKEN` | 10 min | 🚧 Business Manager de Julián | **Toda la ingesta** |
| Los 3 IDs | 1 min | el script | Saber qué cuentas leer |
| `ANTHROPIC_API_KEY` | 3 min | vos + saldo | El agente Analista |

**Camino más corto:** pedile a Julián el rol de administrador en la app **hoy**,
y mientras te lo da, hacé Supabase y el `CRON_SECRET`. Cuando llegue el rol,
sacás el secreto y el token de una sentada.

## Fuentes

- [Supabase · API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase · Migrar a publishable y secret keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
