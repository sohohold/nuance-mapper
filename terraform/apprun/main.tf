locals {
  # GitHub Secretsに未登録のキーは空文字で渡ってくる。空値の環境変数をAppRun APIに
  # 送るとバリデーションで弾かれうるため、値があるものだけを送る。
  # アプリ側も buildCandidates() が `if (apiKey)` で判定しており、
  # 「空文字で存在する」と「キーが無い」は同じ扱いなので挙動は変わらない。
  app_env_all = {
    GEMINI_API_KEY           = var.gemini_api_key
    GROQ_API_KEY             = var.groq_api_key
    CEREBRAS_API_KEY         = var.cerebras_api_key
    OPENROUTER_API_KEY       = var.openrouter_api_key
    UPSTASH_REDIS_REST_URL   = var.upstash_redis_rest_url
    UPSTASH_REDIS_REST_TOKEN = var.upstash_redis_rest_token
  }

  app_env = [
    for k, v in local.app_env_all : { key = k, value = v } if v != ""
  ]
}

# ── コンテナレジストリ ──
# `docker push` の宛先。fqdn = "<registry_subdomain_label>.sakuracr.jp"
resource "sakura_container_registry" "main" {
  name            = "${var.app_name}-registry"
  subdomain_label = var.registry_subdomain_label
  description     = "nuance-mapper container images"

  user = [{
    name                = var.registry_username
    password_wo         = var.registry_password
    password_wo_version = var.registry_password_version
    permission          = "all"
  }]
}

# ── AppRun（共用型） ──
# min_scale = 0 により、アクセスが無い間はインスタンスが起動せず課金されない。
resource "sakura_apprun_shared" "main" {
  name = var.app_name
  # /api/generate はSSEレスポンスをハンドラ完了後にしか送り始めない。
  # OpenRouterのみ設定時のワーストケース: ハシゴの4番目まで最大21秒(7秒×3段)待ち、
  # sequentialModelFallbackで2モデルを各55秒タイムアウトで順に試すため最大131秒かかりうる。
  # min_scale=0のコールドスタート分の余裕も見て180秒に設定する。
  timeout_seconds = 180
  port            = 3000
  min_scale       = 0
  max_scale       = var.max_scale

  components = [{
    name       = var.app_name
    max_cpu    = var.max_cpu
    max_memory = var.max_memory

    deploy_source = {
      container_registry = {
        image               = "${sakura_container_registry.main.fqdn}/${var.app_name}:${var.image_tag}"
        server              = sakura_container_registry.main.fqdn
        username            = var.registry_username
        password_wo         = var.registry_password
        password_wo_version = var.registry_password_version
      }
    }

    env = local.app_env

    # ヘルスチェックは `/` ではなく専用エンドポイントを叩く。`/` はページ全体を
    # レンダリングするうえ、プレビュー環境で有効になるBasic認証(src/proxy.ts)が
    # 401を返すため、AppRunがインスタンスを不健全とみなしてしまう。
    # /api/health は認証の matcher から除外してある。
    probe = {
      http_get = {
        path = "/api/health"
        port = 3000
      }
    }
  }]

  traffics = [{
    version_index = 0
    percent       = 100
  }]
}
