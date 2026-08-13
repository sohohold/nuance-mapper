locals {
  # provider v3.12.7はAppRunのcomponents[].secretをまだ扱えない。APIキー等は
  # deploy-sakura.ymlから公式APIで同期し、Terraformはローテーション検知用の
  # 非機密な版番号だけを通常のenvとして管理する。
  app_env = [{
    key   = "APP_SECRET_VERSION"
    value = var.app_secret_version
  }]

  # digest指定(`sha256:...`)は `@`、タグ指定は `:` で連結する。
  image_ref = format(
    "%s/%s/%s%s%s",
    var.image_registry_host,
    var.image_namespace,
    var.image_repository,
    startswith(var.image_tag, "sha256:") ? "@" : ":",
    var.image_tag,
  )
}

# ── AppRun（共用型） ──
# min_scale = 0 により、アクセスが無い間はインスタンスが起動せず課金されない。
# コンテナイメージは外部レジストリ(Docker Hub)から取得するため、このコンフィグに
# レジストリリソースは含まれない。
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
        image               = local.image_ref
        server              = var.image_registry_server
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

  # 置換はアプリの削除と再作成であり、公開URLが変わる。mainへのmergeで無人の
  # applyが走る構成なので、置換が必要になった時点で気付けないと本番が消える。
  # 実際にコントロールパネルからの編集がコンポーネント名を書き換え、それを
  # 差分と見たTerraformがアプリを破棄した。
  #
  # 意図的に作り直す場合はこのブロックを外してから apply すること。
  # `terraform destroy` も同様に、外さないと失敗する。
  lifecycle {
    prevent_destroy = true
  }
}
