variable "zone" {
  description = "デプロイ先ゾーン (is1a / is1b / tk1a / tk1b)"
  type        = string
  default     = "is1b"
}

variable "server_name" {
  description = "サーバ名（ホスト名にも使われる）"
  type        = string
  default     = "nuance-mapper"
}

variable "core" {
  description = "仮想CPUコア数"
  type        = number
  default     = 2
}

variable "memory" {
  description = "メモリ (GiB)。Next.js のビルドがあるので 4GiB 以上を推奨"
  type        = number
  default     = 4
}

variable "disk_size" {
  description = "ディスクサイズ (GiB)"
  type        = number
  default     = 20
}

variable "ssh_public_key" {
  description = "サーバに登録する SSH 公開鍵（~/.ssh/id_ed25519.pub の中身など）"
  type        = string
}

variable "repo_url" {
  description = <<-EOT
    デプロイするリポジトリの公開URL。
    トークンや認証情報を埋め込んだURLはここに入れないこと
    (sakura_scriptの内容とTerraform stateに平文で残る)。
    プライベートリポジトリの場合は、デプロイ後にSSHして手動でcloneする
    (terraform/server/README.md 参照)。
  EOT
  type        = string
  default     = "https://github.com/sohohold/nuance-mapper.git"
}

variable "repo_branch" {
  description = "デプロイするブランチ"
  type        = string
  default     = "main"
}
