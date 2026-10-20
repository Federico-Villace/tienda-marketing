# 08 · Puesta en producción: lista para probar

> Pendiente al 14-oct-2026. Cubre la ingesta de publicidad (ADR-014) y el login
> (ADR-015). Las altas de usuarios son **internas**: no hay registro abierto.

## Ya hecho

- [x] Migración `20261013120000` aplicada: organización *999 Motos* y `resumen_publicidad`.
- [x] Token del bot en Vault (`pnpm guardar-token-meta`) y verificado (`pnpm diagnostico-meta`).
- [x] Primera carga (`pnpm sincronizar`): 123 campañas, ARS 4.912.968, 3.192 resultados.

## 1 · Supabase

- [ ] **Authentication → Sign In / Providers → desactivar "Allow new users to sign up".**
  Nadie se registra solo: las altas se hacen con `pnpm alta-usuario`.

## 2 · Vercel

- [ ] **Settings → Environment Variables:** que estén cargadas
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, que usa el login
  - `SUPABASE_SECRET_KEY`
  - `META_API_VERSION`
  - `CRON_SECRET`, un valor largo y aleatorio
- [ ] **Settings → Deployment Protection:** desactivado. El login propio lo
  reemplaza, y con la protección prendida el cliente no podría entrar.

## 3 · Tu usuario

- [ ] `pnpm alta-usuario tu@email.com director`
  - ⚠️ Imprime la clave inicial **una sola vez**. Correlo en tu terminal, no
    dentro del chat con `!`.

## 4 · Deploy

- [ ] `git push`

## 5 · Probar el login

- [ ] Ventana de incógnito → `/tablero` → te manda a `/login`.
- [ ] Entrás con tu email y tu clave → volvés a `/tablero`.
- [ ] Clave equivocada → "Email o contraseña incorrectos".
- [ ] **Salir** → abrís `/tablero` de nuevo → te pide el login otra vez.

## 6 · Probar la publicidad

- [ ] `/tablero` → **Publicidad**: alrededor de ARS 4,9 M, 123 campañas y 3.192
  resultados, con "Datos reales de Meta · actualizado …".
- [ ] **Settings → Cron Jobs:** aparece `/api/sync` con `0 9 * * *` (06:00 ART).
- [ ] Sync manual en producción:
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/sync
  ```
  Tiene que devolver `"estado":"ok"`. Sin el header, **401**.
- [ ] Al día siguiente, después de las 06:00: **Cron Jobs → View Logs**, la
  corrida en **200**.

## 7 · Probar las publicaciones orgánicas (ADR-016)

No hay variables de entorno nuevas.

- [ ] **Supabase → SQL Editor:** aplicar
  `supabase/migrations/20261020120000_metricas_diarias_y_resumen_publicaciones.sql`.
- [ ] `git push` (sube el endpoint, el cron y el tablero nuevo).
- [ ] Primera carga, desde tu máquina: `pnpm sincronizar-organico`. Tiene que
  terminar en `ok`, con 14 cuentas (7 facebook, 7 instagram), cada una con sus
  publicaciones y métricas.
- [ ] `/tablero` → cada marca muestra sus publicaciones reales de los últimos 90
  días, sin el aviso de "datos de muestra".
- [ ] **Settings → Cron Jobs:** aparece `/api/sync-organico` con `15 9 * * *`
  (06:15 ART).
- [ ] Sync manual en producción (opcional):
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/sync-organico
  ```
  Sin el header, **401**.

## 8 · Dar acceso a otra persona

- [ ] `pnpm alta-usuario julian@... director` (o `operador` / `lector`).
- [ ] Pasale la clave por un canal privado.

## Antes de la demo

- [ ] Confirmar con Julián que "resultado" = conversación de mensajes iniciada o
  lead (ADR-014).
- [ ] Publicaciones de IG y FB: ya son reales (sección 7).

## Para más adelante

- Cambiar o recuperar la clave desde la app. Hoy se resetea desde Supabase.
- Pantalla de administración de usuarios, en lugar del script.
