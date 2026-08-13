#!/usr/bin/env bash

# AppRun共用型のシークレット環境変数を公式APIで同期する。
#
# Terraform provider v3.12.7 と apprun-cli v0.8.1 は、2026-06-25に追加された
# components[].secret をまだ扱えない。通常のenvには版番号だけを残し、このスクリプトが
# APIキー等をsecretへ移す。値そのものは標準出力へ出さない。

set -euo pipefail

APP_SECRET_VERSION="${APP_SECRET_VERSION:-${TF_VAR_app_secret_version:-}}"
: "${APP_NAME:?APP_NAME is required}"
: "${APP_SECRET_VERSION:?APP_SECRET_VERSION is required}"
: "${SAKURA_ACCESS_TOKEN:?SAKURA_ACCESS_TOKEN is required}"
: "${SAKURA_ACCESS_TOKEN_SECRET:?SAKURA_ACCESS_TOKEN_SECRET is required}"

APPRUN_API_ROOT="${APPRUN_API_ROOT:-https://secure.sakura.ad.jp/cloud/api/apprun/1.0/apprun/api}"

secret_json=$(jq -nc \
  --arg gemini "${GEMINI_API_KEY:-}" \
  --arg groq "${GROQ_API_KEY:-}" \
  --arg cerebras "${CEREBRAS_API_KEY:-}" \
  --arg openrouter "${OPENROUTER_API_KEY:-}" \
  --arg redis_url "${UPSTASH_REDIS_REST_URL:-}" \
  --arg redis_token "${UPSTASH_REDIS_REST_TOKEN:-}" \
  --arg preview_password "${PREVIEW_BASIC_AUTH_PASSWORD:-}" '
  [
    {key: "GEMINI_API_KEY", value: $gemini},
    {key: "GROQ_API_KEY", value: $groq},
    {key: "CEREBRAS_API_KEY", value: $cerebras},
    {key: "OPENROUTER_API_KEY", value: $openrouter},
    {key: "UPSTASH_REDIS_REST_URL", value: $redis_url},
    {key: "UPSTASH_REDIS_REST_TOKEN", value: $redis_token},
    {key: "PREVIEW_BASIC_AUTH_PASSWORD", value: $preview_password}
  ] | map(select(.value != ""))')

managed_keys=$(jq -nc '[
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "PREVIEW_BASIC_AUTH_PASSWORD"
]')
expected_secret_keys=$(jq -c '[.[].key] | unique | sort' <<<"$secret_json")

applications=$(curl --fail-with-body --silent --show-error \
  --user "$SAKURA_ACCESS_TOKEN:$SAKURA_ACCESS_TOKEN_SECRET" \
  "$APPRUN_API_ROOT/applications?page_size=100")
app_ids=$(jq -r --arg name "$APP_NAME" '.data[] | select(.name == $name) | .id' \
  <<<"$applications")
app_count=$(grep -c . <<<"$app_ids" || true)

if [ "$app_count" -eq 0 ]; then
  echo "AppRun application $APP_NAME does not exist yet; secret sync is deferred."
  exit 0
fi
if [ "$app_count" -ne 1 ]; then
  echo "Expected exactly one AppRun application named $APP_NAME, found $app_count." >&2
  exit 1
fi
app_id=$app_ids

application=""
for attempt in $(seq 1 60); do
  application=$(curl --fail-with-body --silent --show-error \
    --user "$SAKURA_ACCESS_TOKEN:$SAKURA_ACCESS_TOKEN_SECRET" \
    "$APPRUN_API_ROOT/applications/$app_id")
  status=$(jq -r '.status' <<<"$application")
  [ "$status" = "Healthy" ] && break
  if [ "$status" = "UnHealthy" ]; then
    echo "AppRun application $APP_NAME is unhealthy; refusing to change secrets." >&2
    exit 1
  fi
  sleep 5
done
if [ "${status:-}" != "Healthy" ]; then
  echo "Timed out waiting for AppRun application $APP_NAME to become healthy." >&2
  exit 1
fi
current_version=$(jq -r '
  [.components[].env[]? | select(.key == "APP_SECRET_VERSION") | .value][0] // ""
' <<<"$application")
current_secret_keys=$(jq -c '[.components[].secret[]?.key] | unique | sort' \
  <<<"$application")

if [ "$current_version" = "$APP_SECRET_VERSION" ] \
  && [ "$current_secret_keys" = "$expected_secret_keys" ]; then
  echo "AppRun secrets are already current for $APP_NAME (version $APP_SECRET_VERSION)."
  exit 0
fi

payload=$(jq -c \
  --arg version "$APP_SECRET_VERSION" \
  --argjson secrets "$secret_json" \
  --argjson managed_keys "$managed_keys" '
  {
    components: [
      .components[] |
      . as $component |
      {
        name: $component.name,
        max_cpu: $component.max_cpu,
        max_memory: $component.max_memory,
        deploy_source: {
          # action=keepでは保存済み資格情報を丸ごと再利用する。server/usernameを
          # 同時に送ると、APIが「passwordなしの新規認証情報」と解釈して
          # invalid Passwordを返すため、image以外は送らない。
          container_registry: {
            image: $component.deploy_source.container_registry.image,
            action: "keep"
          }
        },
        env: (
          (($component.env // [])
            | map(select(
                .key != "APP_SECRET_VERSION"
                and (.key as $key | $managed_keys | index($key) | not)
              )))
          + [{key: "APP_SECRET_VERSION", value: $version}]
        ),
        secret: $secrets,
        probe: $component.probe
      }
    ],
    all_traffic_available: true
  }
' <<<"$application")

response=$(curl --silent --show-error \
  --user "$SAKURA_ACCESS_TOKEN:$SAKURA_ACCESS_TOKEN_SECRET" \
  --header "Content-Type: application/json" \
  --request PATCH \
  --data "$payload" \
  --write-out $'\n%{http_code}' \
  "$APPRUN_API_ROOT/applications/$app_id")
http_status=${response##*$'\n'}
updated=${response%$'\n'*}
if [[ ! "$http_status" =~ ^2 ]]; then
  echo "AppRun secret update failed with HTTP $http_status:" >&2
  # APIエラーだけを出す。リクエストpayload（secret値）は絶対に表示しない。
  jq -c '.error // .' <<<"$updated" >&2 || echo "<non-JSON API error>" >&2
  exit 1
fi

updated_version=$(jq -r '
  [.components[].env[]? | select(.key == "APP_SECRET_VERSION") | .value][0] // ""
' <<<"$updated")
updated_secret_keys=$(jq -c '[.components[].secret[]?.key] | unique | sort' \
  <<<"$updated")
leaked_env_keys=$(jq -c \
  --argjson managed_keys "$managed_keys" '
  [.components[].env[]?.key | select(. as $key | $managed_keys | index($key))]
' <<<"$updated")

if [ "$updated_version" != "$APP_SECRET_VERSION" ] \
  || [ "$updated_secret_keys" != "$expected_secret_keys" ] \
  || [ "$leaked_env_keys" != "[]" ]; then
  echo "AppRun secret verification failed for $APP_NAME." >&2
  exit 1
fi

echo "Synchronized AppRun secret keys for $APP_NAME (version $APP_SECRET_VERSION):"
jq -r '.[].key | "- " + .' <<<"$secret_json"

for attempt in $(seq 1 60); do
  status=$(curl --fail-with-body --silent --show-error \
    --user "$SAKURA_ACCESS_TOKEN:$SAKURA_ACCESS_TOKEN_SECRET" \
    "$APPRUN_API_ROOT/applications/$app_id" | jq -r '.status')
  [ "$status" = "Healthy" ] && exit 0
  if [ "$status" = "UnHealthy" ]; then
    echo "AppRun application $APP_NAME became unhealthy after secret sync." >&2
    exit 1
  fi
  sleep 5
done

echo "Timed out waiting for AppRun application $APP_NAME after secret sync." >&2
exit 1
