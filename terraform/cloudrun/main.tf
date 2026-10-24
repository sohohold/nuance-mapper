locals {
  # ephemeral変数をまとめたもの。write-only属性(secret_data_wo)にだけ渡す。
  secret_values = {
    GEMINI_API_KEY           = var.gemini_api_key
    GROQ_API_KEY             = var.groq_api_key
    CEREBRAS_API_KEY         = var.cerebras_api_key
    OPENROUTER_API_KEY       = var.openrouter_api_key
    UPSTASH_REDIS_REST_URL   = var.upstash_redis_rest_url
    UPSTASH_REDIS_REST_TOKEN = var.upstash_redis_rest_token
  }

  image_repository = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/${var.service_name}"
}

# ── API ──
# serviceusage と cloudresourcemanager はこのリソース自体の前提なので、
# 初回だけgcloudで有効化する（READMEの「初回設定」参照）。
resource "google_project_service" "enabled" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com",
  ])

  service = each.value
  # destroy時にAPIを無効化すると、同じプロジェクトの他リソースまで止まる。
  disable_on_destroy = false
}

# ── Artifact Registry ──
# 無料枠は0.5GBなので、新しい順に image_keep_count 件だけ残す。
# クリーンアップは非同期(1日1回程度)で走るため、一時的に件数を超えることはある。
resource "google_artifact_registry_repository" "app" {
  repository_id = var.service_name
  location      = var.region
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  # KEEPはDELETEより優先される。
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.image_keep_count
    }
  }

  cleanup_policies {
    id     = "delete-others"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.enabled]
}

# ── サービスアカウント ──
# 既定のCompute Engineサービスアカウントは編集者権限を持つため、
# シークレットの読み取りだけを許した専用アカウントで実行する。
resource "google_service_account" "run" {
  account_id   = "${var.service_name}-run"
  display_name = "Nuance Mapper Cloud Run runtime"

  depends_on = [google_project_service.enabled]
}

# ── Secret Manager ──
# 値はephemeral変数からwrite-only属性で渡すため、stateには保存されない。
resource "google_secret_manager_secret" "app" {
  for_each = toset(var.secret_env_names)

  secret_id = "${var.service_name}-${lower(replace(each.key, "_", "-"))}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "app" {
  for_each = google_secret_manager_secret.app

  secret                 = each.value.id
  secret_data_wo         = local.secret_values[each.key]
  secret_data_wo_version = var.secret_version

  # secret_data_wo_version の変更は置換になる。既定の「削除してから作成」では、
  # 稼働中のリビジョンが参照する版が先に消え、その間の起動がシークレットを読めずに失敗する。
  # 新しい版を作り、Cloud Runを新しいリビジョンへ切り替えてから古い版を消す。
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "run" {
  for_each = google_secret_manager_secret.app

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run.member
}

# ── Cloud Run ──
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # allUsersへのroles/run.invoker付与の代わりにIAMチェック自体を外す。
  # 組織ポリシー(ドメイン制限共有)でallUsersを付与できないプロジェクトでも公開できる。
  invoker_iam_disabled = true

  # 置換や削除はURLの変更を伴うため、意図せず消えないようにしておく。
  # 削除する場合は false にして apply してから destroy する。
  deletion_protection = true

  template {
    service_account = google_service_account.run.email

    # /api/generate はSSEレスポンスをハンドラ完了後にしか送り始めない。
    # OpenRouterのみ設定時のワーストケースは最大131秒かかりうる（terraform/apprun/main.tf参照）。
    # コールドスタート分の余裕も見て180秒に設定する。
    timeout = "180s"

    max_instance_request_concurrency = var.concurrency

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      image = var.initial_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        # リクエスト処理中だけCPUを割り当てる(リクエストベース課金)。無料枠の前提。
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = google_secret_manager_secret_version.app
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret = google_secret_manager_secret.app[env.key].secret_id
              # 版を固定し、ローテーション時に新しいリビジョンが作られるようにする。
              version = env.value.version
            }
          }
        }
      }
    }
  }

  lifecycle {
    # イメージはGitHub Actionsの `gcloud run deploy` が更新する。
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.run,
  ]
}
