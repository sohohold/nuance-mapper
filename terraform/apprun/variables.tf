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

variable "image_registry_host" {
  description = "イメージ参照のプレフィックス。Docker Hubは `docker.io`"
  type        = string
  default     = "docker.io"
}

variable "image_registry_server" {
  description = <<-EOT
    AppRunがレジストリ認証に使うホスト名。イメージ参照のプレフィックスとは別物。

    Docker Hubでは `index.docker.io` を指定する。コントロールパネルから設定した
    正常動作中のアプリがこの値を保持しており、`docker.io` を送ると
    APIが 400 Validation Error を返す。イメージ参照側は `docker.io/...` のままでよい。
  EOT
  type        = string
  default     = "index.docker.io"

  # この変数は以前イメージ参照のプレフィックスを兼ねており、`docker.io` が正しい値
  # としてREADMEとtfvars.exampleに載っていた。名前は同じまま意味だけが変わったので、
  # gitignoreされた terraform.tfvars に古い値が残っていると、デフォルトを上書きして
  # 本番を止めたのと同じ400を静かに再現する。planの時点で止める。
  validation {
    condition     = var.image_registry_server != "docker.io"
    error_message = "image_registry_server はAppRunがレジストリ認証に使うホスト名で、Docker Hubでは index.docker.io を指定する。docker.io を送るとAPIが400 Validation Errorを返す。イメージ参照のプレフィックスを変えたい場合は image_registry_host を使うこと。"
  }
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

# ── AppRunシークレット ──

variable "app_secret_version" {
  description = <<-EOT
    AppRunのシークレット環境変数をローテーションするための版番号。
    GitHub Actions variable APPRUN_SECRET_VERSION と同じ値を渡す。
    LLM APIキーまたはUpstash認証情報を変更したら増やすこと。
  EOT
  type        = string
  default     = "1"
}
