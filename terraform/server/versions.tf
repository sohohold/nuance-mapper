terraform {
  # sacloud/sakura プロバイダは Terraform 1.11 以降が必要
  required_version = ">= 1.11"

  required_providers {
    sakura = {
      source  = "sacloud/sakura"
      version = "~> 3.12"
    }
  }
}
