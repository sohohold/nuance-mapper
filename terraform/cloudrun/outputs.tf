output "service_url" {
  description = "Cloud Runの公開URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "image_repository" {
  description = "pushするイメージの参照（タグを除く）"
  value       = local.image_repository
}

output "dashboard_url" {
  description = "監視ダッシュボードのURL"
  value       = "https://console.cloud.google.com/monitoring/dashboards/builder/${element(split("/", google_monitoring_dashboard.main.id), 3)}?project=${var.project_id}"
}

output "github_variables" {
  description = "GitHubのRepository variablesへ登録する値"
  value = {
    GCP_PROJECT_ID                 = var.project_id
    GCP_REGION                     = var.region
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER_SERVICE_ACCOUNT   = google_service_account.deployer.email
  }
}
