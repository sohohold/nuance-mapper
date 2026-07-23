variable "zone" {
  description = "デプロイ先ゾーン (is1a / is1b / tk1a / tk1b)"
  type        = string
  default     = "is1b"
}

variable "app_name" {
  description = "AppRunアプリ名"
  type        = string
  default     = "nuance-mapper"
}

# ── コンテナレジストリ ──

variable "registry_subdomain_label" {
  description = "コンテナレジストリのFQDNサブドメイン部分（<label>.sakuracr.jp）。さくらのクラウド全体で一意である必要がある"
  type        = string
}

variable "registry_username" {
  description = "コンテナレジストリ(docker login)用ユーザー名"
  type        = string
  default     = "ci"
}

variable "registry_password" {
  description = "コンテナレジストリ(docker login)用パスワード"
  type        = string
  sensitive   = true
}

variable "registry_password_version" {
  description = "registry_password を変更(ローテーション)するたびに増やすバージョン番号。write-only属性は値そのものではなくこの番号の変化で更新を検知するため、パスワードを変えたらここも必ず増やすこと"
  type        = number
  default     = 1
}

# ── AppRun ──

variable "image_tag" {
  description = "デプロイするコンテナイメージのタグ（通常はgitのコミットSHA）"
  type        = string
  default     = "latest"
}

variable "max_cpu" {
  description = "1インスタンスあたりの最大CPU (0.5 / 1 / 2 のいずれか)"
  type        = string
  default     = "0.5"
}

variable "max_memory" {
  description = "1インスタンスあたりの最大メモリ (1Gi / 2Gi / 4Gi のいずれか)"
  type        = string
  default     = "1Gi"
}

variable "max_scale" {
  description = "最大インスタンス数（min_scale は 0 固定＝完全スケールゼロ）"
  type        = number
  default     = 2
}

# ── LLM プロバイダのAPIキー（すべて任意。未設定ならアプリはモックデータを返す） ──

variable "gemini_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "groq_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "cerebras_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "openrouter_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "upstash_redis_rest_url" {
  type    = string
  default = ""
}

variable "upstash_redis_rest_token" {
  type      = string
  default   = ""
  sensitive = true
}
