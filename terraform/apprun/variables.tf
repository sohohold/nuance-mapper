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

# ── コンテナイメージ ──
# AppRunはさくらのコンテナレジストリのほか、Docker Hub と GitHub Container Registry
# からのデプロイに対応している（マニュアル「技術概要」の コンポーネント制限 を参照）。
# レジストリの月額を避けるため Docker Hub を使う。

variable "image_registry_server" {
  description = "コンテナレジストリのホスト名。Docker Hubは `docker.io` のみ受け付ける（`index.docker.io` などはコントロールパネルのバリデーションで弾かれる）"
  type        = string
  default     = "docker.io"
}

variable "image_namespace" {
  description = "イメージの名前空間。Docker Hubの個人アカウントではユーザー名と同じ"
  type        = string
}

variable "image_repository" {
  description = "イメージのリポジトリ名"
  type        = string
  default     = "nuance-mapper"
}

variable "image_tag" {
  description = <<-EOT
    デプロイするイメージのタグ（通常はgitのコミットSHA）。
    `sha256:...` を渡すとdigest指定になる。

    タグは必ず一意にすること。AppRunのバージョンは構成情報のスナップショットであり、
    イメージ参照文字列が変わらなければ、レジストリ側で同じタグを上書きしても
    新しいバージョンは作成されない（pushは成功するのにデプロイされない）。
  EOT
  type        = string
  default     = "latest"
}

variable "registry_username" {
  description = "レジストリの認証ユーザー名。Docker Hubのユーザー名"
  type        = string
}

variable "registry_password" {
  description = "レジストリの認証パスワード。Docker HubではPersonal Access Token（read権限で足りる）"
  type        = string
  sensitive   = true
}

variable "registry_password_version" {
  description = <<-EOT
    registry_password を変更(ローテーション)するたびに増やすバージョン番号。
    write-only属性は値そのものではなくこの番号の変化で更新を検知するため、
    パスワードを変えたらここも必ず増やすこと。

    2 = さくらのコンテナレジストリからDocker Hubへの移行。レジストリを差し替えると
    認証情報も別物になるが、この番号を1のままにしていたため、serverとusernameだけが
    Docker Hubに変わり、パスワードは旧レジストリのものが残ったまま更新がかかり、
    AppRunのAPIが400 Validation Errorを返した。
  EOT
  type        = number
  default     = 2
}

# ── AppRun ──

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
