variable "project_id" {
  description = "デプロイ先のGCPプロジェクトID（請求先アカウントの紐付けが必要）"
  type        = string
}

variable "region" {
  description = "Cloud RunとArtifact Registryのリージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "service_name" {
  description = "Cloud Runサービス名。Artifact Registryのリポジトリ名などにも使う"
  type        = string
  default     = "nuance-mapper"
}

variable "github_repository" {
  description = "デプロイを許可するGitHubリポジトリ（owner/repo）"
  type        = string
  default     = "sohohold/nuance-mapper"
}

# ── Cloud Run ──

variable "initial_image" {
  description = <<-EOT
    サービス作成時だけ使うイメージ。以後のイメージ更新はGitHub Actionsの
    `gcloud run deploy` が行い、Terraformはこの属性の差分を無視する。
    Artifact Registryが空の状態でも作成できるよう、Google公開のサンプルを既定にしている。
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "cpu" {
  description = "1インスタンスあたりのvCPU。1未満にすると同時実行数が1に制限される"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "1インスタンスあたりのメモリ"
  type        = string
  default     = "512Mi"
}

variable "max_instances" {
  description = <<-EOT
    最大インスタンス数。費用の上限であり、インメモリのレート制限
    (src/lib/rate-limit.ts)をインスタンス間で一貫させるためにも1を推奨する。
  EOT
  type        = number
  default     = 1
}

variable "concurrency" {
  description = "1インスタンスが同時に処理するリクエスト数。LLMの応答待ちが中心なので大きめでよい"
  type        = number
  default     = 80
}

variable "image_keep_count" {
  description = "Artifact Registryに残すイメージ数。切り戻せる範囲もこの件数になる（無料枠は0.5GB）"
  type        = number
  default     = 3
}

# ── シークレット ──

variable "secret_env_names" {
  description = <<-EOT
    Secret Managerに格納してCloud Runへ注入する環境変数名。使うものだけを列挙し、
    値は同名の小文字変数(TF_VAR_gemini_api_key など)で渡す。
    Secret Managerの無料枠は有効なバージョン6個までで、6つ全部を使うとちょうど上限になる。
  EOT
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([for name in var.secret_env_names : contains([
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "CEREBRAS_API_KEY",
      "OPENROUTER_API_KEY",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ], name)])
    error_message = "secret_env_names には GEMINI_API_KEY / GROQ_API_KEY / CEREBRAS_API_KEY / OPENROUTER_API_KEY / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN のいずれかを指定する。"
  }
}

variable "secret_version" {
  description = <<-EOT
    シークレット値のローテーション用の版番号。write-only属性は値を読み戻せないため、
    この番号の変化で更新を検知する。値を変えたら必ず増やすこと。
    増やすと secret_env_names の全シークレットが作り直されるので、全部の値を渡す。
  EOT
  type        = string
  default     = "1"
}

# 値はstateにもplanにも残らない。作成時とsecret_versionを増やした時だけ必要。
variable "gemini_api_key" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

variable "groq_api_key" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

variable "cerebras_api_key" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

variable "openrouter_api_key" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

variable "upstash_redis_rest_url" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

variable "upstash_redis_rest_token" {
  type      = string
  default   = null
  ephemeral = true
  sensitive = true
}

# ── 監視 ──

variable "alert_email" {
  description = "アラートと予算通知の送信先。空ならアラートはコンソール上のインシデントのみになる"
  type        = string
  default     = ""
}

variable "uptime_check_period" {
  description = <<-EOT
    外形監視の間隔(60s / 300s / 600s / 900s)。チェックのたびにスケールゼロからの
    起動が起こりうるため、無料枠の消費を抑えるよう最長の15分を既定にしている。
  EOT
  type        = string
  default     = "900s"
}

variable "alert_5xx_threshold" {
  description = "5分間の5xxレスポンス数がこの値を超えたらアラートを出す"
  type        = number
  default     = 5
}

# ── 予算 ──

variable "billing_account_id" {
  description = <<-EOT
    予算アラートを作る請求先アカウントID（XXXXXX-XXXXXX-XXXXXX）。
    空なら予算を作らない。作成には請求先アカウントの管理者権限が要る。
  EOT
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "月額予算。超過しても課金は止まらず、通知だけが届く"
  type        = number
  default     = 1000
}

variable "budget_currency" {
  description = "予算の通貨。請求先アカウントの通貨と一致しないとAPIがエラーを返す"
  type        = string
  default     = "JPY"
}
