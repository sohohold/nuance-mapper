output "app_url" {
  description = "AppRunアプリの公開URL"
  value       = sakura_apprun_shared.main.public_url
}

output "registry_fqdn" {
  description = "コンテナレジストリのFQDN（docker push先）"
  value       = sakura_container_registry.main.fqdn
}
