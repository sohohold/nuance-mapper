# ── コンテナレジストリ ──
# `docker push` の宛先。fqdn = "<registry_subdomain_label>.sakuracr.jp"
resource "sakura_container_registry" "main" {
  name            = "${var.app_name}-registry"
  subdomain_label = var.registry_subdomain_label
  description     = "nuance-mapper container images"

  user {
    name                = var.registry_username
    password_wo         = var.registry_password
    password_wo_version = 1
    permission          = "all"
  }
}

# ── AppRun（共用型） ──
# min_scale = 0 により、アクセスが無い間はインスタンスが起動せず課金されない。
resource "sakura_apprun_shared" "main" {
  name            = var.app_name
  timeout_seconds = 60
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
        password_wo_version = 1
      }
    }

    env = [
      { key = "GEMINI_API_KEY", value = var.gemini_api_key },
      { key = "GROQ_API_KEY", value = var.groq_api_key },
      { key = "CEREBRAS_API_KEY", value = var.cerebras_api_key },
      { key = "OPENROUTER_API_KEY", value = var.openrouter_api_key },
      { key = "UPSTASH_REDIS_REST_URL", value = var.upstash_redis_rest_url },
      { key = "UPSTASH_REDIS_REST_TOKEN", value = var.upstash_redis_rest_token },
    ]

    probe = {
      http_get = {
        path = "/"
        port = 3000
      }
    }
  }]

  traffics = [{
    version_index = 0
    percent       = 100
  }]
}
