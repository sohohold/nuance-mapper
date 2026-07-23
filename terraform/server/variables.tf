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
  description = "デプロイするリポジトリの URL（プライベートの場合はトークン付き URL が必要）"
  type        = string
  default     = "https://github.com/sohohold/nuance-mapper.git"
}

variable "repo_branch" {
  description = "デプロイするブランチ"
  type        = string
  default     = "main"
}

# ── LLM プロバイダのAPIキー（すべて任意。未設定ならアプリはモックデータを返す） ──

variable "gemini_api_key" {
  description = "Google AI Studio の API キー（任意）"
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq の API キー（任意）"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cerebras_api_key" {
  description = "Cerebras の API キー（任意）"
  type        = string
  default     = ""
  sensitive   = true
}

variable "openrouter_api_key" {
  description = "OpenRouter の API キー（任意）"
  type        = string
  default     = ""
  sensitive   = true
}

variable "upstash_redis_rest_url" {
  description = "Upstash Redis REST URL（任意）"
  type        = string
  default     = ""
}

variable "upstash_redis_rest_token" {
  description = "Upstash Redis REST トークン（任意）"
  type        = string
  default     = ""
  sensitive   = true
}
