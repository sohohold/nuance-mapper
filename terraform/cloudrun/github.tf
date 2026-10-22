# ── GitHub ActionsからのデプロイをWorkload Identity Federationで認証する ──
# サービスアカウントキーを発行せず、GitHubのOIDCトークンを短期の認証情報へ交換する。
# デプロイ用アカウントに許すのはイメージのpushとCloud Runのリビジョン更新だけで、
# シークレットや監視などの変更はローカルからのterraform applyで行う。

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # 対象リポジトリのmainブランチで実行されたワークフローだけを受け付ける。
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "${var.service_name}-deployer"
  display_name = "Nuance Mapper GitHub Actions deployer"

  depends_on = [google_project_service.enabled]
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_artifact_registry_repository_iam_member" "deployer" {
  repository = google_artifact_registry_repository.app.name
  location   = google_artifact_registry_repository.app.location
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

resource "google_cloud_run_v2_service_iam_member" "deployer" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.developer"
  member   = google_service_account.deployer.member
}

# 新しいリビジョンを実行用サービスアカウントで動かすために必要（actAs）。
resource "google_service_account_iam_member" "deployer_act_as_run" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
