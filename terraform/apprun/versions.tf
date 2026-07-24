terraform {
  required_version = ">= 1.11"

  required_providers {
    sakura = {
      source  = "sacloud/sakura"
      version = "~> 3.12"
    }
  }

  # state はさくらのオブジェクトストレージ(S3互換)に保存する。
  # bucket/key 等の具体値はコミットせず `terraform init -backend-config=backend.hcl` で渡す。
  # backend.hcl は backend.hcl.example をコピーして作成する（.gitignore 済み）。
  backend "s3" {}
}

# 認証情報はコードに書かず、環境変数から読み込む:
#   export SAKURA_ACCESS_TOKEN="..."
#   export SAKURA_ACCESS_TOKEN_SECRET="..."
provider "sakura" {
  default_zone = var.zone
}
