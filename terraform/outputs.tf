output "ip_address" {
  description = "サーバのグローバルIPアドレス"
  value       = sakura_server.main.ip_address
}

output "app_url" {
  description = "アプリのURL（初回はビルドに数分かかる）"
  value       = "http://${sakura_server.main.ip_address}/"
}

output "ssh_command" {
  description = "SSH接続コマンド"
  value       = "ssh ubuntu@${sakura_server.main.ip_address}"
}
