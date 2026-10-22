terraform {
  # LLM APIキーをSecret Managerへ渡すのにephemeral変数とwrite-only属性を使う。
  required_version = ">= 1.11"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }

  # state はGCSに保存する。GCSバックエンドはロックに対応している。
  # bucket/prefix の具体値はコミットせず `terraform init -backend-config=backend.hcl` で渡す。
  # backend.hcl は backend.hcl.example をコピーして作成する（.gitignore 済み）。
  backend "gcs" {}
}

# 認証はApplication Default Credentialsを使う:
#   gcloud auth application-default login
provider "google" {
  project = var.project_id
  region  = var.region

  # 予算(billingbudgets)APIはユーザー認証で呼ぶとquota projectを要求する。
  user_project_override = true
  billing_project       = var.project_id
}
