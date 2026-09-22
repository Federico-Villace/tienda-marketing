#!/usr/bin/env bash
# Fase 0 · Verificación de accesos a Meta — BLOQUEANTE
#
# Responde tres preguntas antes de escribir una línea de ingesta:
#   1. ¿Qué permisos trae realmente el token?
#   2. ¿Es de system user (no expira) o de usuario (expira)?
#   3. ¿A qué app pertenece?
#
# Uso:  cp env.example .env.local && editar && ./scripts/verificar-permisos-meta.sh
#
# Este script SOLO LEE. No modifica nada en Meta.

set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env.local ]] || { echo "✗ Falta .env.local — copialo de env.example"; exit 1; }

set -a; source .env.local; set +a

: "${META_APP_ID:?falta META_APP_ID en .env.local}"
: "${META_APP_SECRET:?falta META_APP_SECRET en .env.local}"
: "${META_ACCESS_TOKEN:?falta META_ACCESS_TOKEN en .env.local}"
VERSION="${META_API_VERSION:-v26.0}"

BASE="https://graph.facebook.com/${VERSION}"
APP_TOKEN="${META_APP_ID}|${META_APP_SECRET}"

command -v jq >/dev/null || { echo "✗ Falta jq — instalalo con: brew install jq"; exit 1; }

echo "═══ 1 · Identidad del token ═══"
curl -sG "${BASE}/debug_token" \
  --data-urlencode "input_token=${META_ACCESS_TOKEN}" \
  --data-urlencode "access_token=${APP_TOKEN}" \
| jq '{
    tipo:        .data.type,
    app_id:      .data.app_id,
    app:         .data.application,
    valido:      .data.is_valid,
    expira:      (if .data.expires_at == 0 then "NUNCA ✓" else (.data.expires_at | todate) end),
    data_expira: (if (.data.data_access_expires_at // 0) == 0 then "nunca" else (.data.data_access_expires_at | todate) end)
  }'

echo
echo "═══ 2 · Permisos otorgados ═══"
OTORGADOS=$(curl -sG "${BASE}/me/permissions" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}" \
  | jq -r '.data[]? | select(.status=="granted") | .permission' | sort)

if [[ -z "${OTORGADOS}" ]]; then
  echo "  (sin respuesta — típico de un token de system user; revisá el paso 1)"
else
  echo "${OTORGADOS}" | sed 's/^/  · /'
fi

echo
echo "═══ 3 · Checklist del MVP ═══"
FALTA=0
for p in instagram_basic instagram_manage_insights pages_read_engagement ads_read business_management; do
  if grep -qx "$p" <<< "${OTORGADOS}"; then
    printf '  ✓ %s\n' "$p"
  else
    printf '  ✗ %s  ← FALTA\n' "$p"
    FALTA=1
  fi
done

echo
echo "═══ 4 · Fase 4 (publicación) ═══"
for p in pages_manage_posts instagram_business_content_publish; do
  grep -qx "$p" <<< "${OTORGADOS}" \
    && printf '  ✓ %s\n' "$p" \
    || printf '  ○ %s  (no hace falta todavía)\n' "$p"
done

echo
echo "═══ 5 · Activos alcanzables ═══"
echo "— Páginas de Facebook:"
curl -sG "${BASE}/me/accounts" \
  --data-urlencode "fields=id,name,instagram_business_account{id,username}" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}" \
| jq -r '.data[]? | "  · \(.name) [page_id \(.id)]\(if .instagram_business_account then "  → IG @\(.instagram_business_account.username) [\(.instagram_business_account.id)]" else "  (sin IG vinculado)" end)"' \
  || echo "  (sin acceso a páginas)"

echo "— Cuentas publicitarias:"
curl -sG "${BASE}/me/adaccounts" \
  --data-urlencode "fields=id,name,account_status,currency" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}" \
| jq -r '.data[]? | "  · \(.name) [\(.id)] \(.currency)"' \
  || echo "  (sin acceso a cuentas publicitarias)"

echo
if [[ ${FALTA} -eq 1 ]]; then
  echo "⛔ Faltan permisos del MVP. Pedírselos a Julián ANTES de seguir."
  exit 2
fi
echo "✅ Fase 0 superada. Anotá los IDs de arriba en .env.local y seguimos."
