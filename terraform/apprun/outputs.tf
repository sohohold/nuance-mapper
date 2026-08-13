output "app_url" {
  description = "AppRunアプリの公開URL"
  value       = sakura_apprun_shared.main.public_url
}

output "deployed_image" {
  description = "AppRunに設定されているコンテナイメージの参照"
  value       = local.image_ref
}
