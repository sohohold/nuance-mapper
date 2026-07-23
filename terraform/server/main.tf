# 認証情報はコードに書かず、環境変数から読み込む:
#   export SAKURA_ACCESS_TOKEN="..."
#   export SAKURA_ACCESS_TOKEN_SECRET="..."
provider "sakura" {
  default_zone = var.zone
}

# さくらのクラウドが提供する最新の Ubuntu パブリックアーカイブを検索
data "sakura_archive" "ubuntu" {
  os_type = "ubuntu"
  zone    = var.zone
}

# ── ファイアウォール（パケットフィルタ）──
# さくらのパケットフィルタはステートレスなので、外向き通信の戻りパケット
# （エフェメラルポート宛て）も明示的に許可する必要がある。
resource "sakura_packet_filter" "main" {
  name        = "${var.server_name}-filter"
  description = "nuance-mapper: SSH と HTTP のみ受け付ける"
  zone        = var.zone
}

resource "sakura_packet_filter_rules" "main" {
  packet_filter_id = sakura_packet_filter.main.id
  zone             = var.zone

  expression = [
    {
      protocol         = "tcp"
      destination_port = "22"
      allow            = true
      description      = "SSH"
    },
    {
      protocol         = "tcp"
      destination_port = "80"
      allow            = true
      description      = "HTTP (Next.js)"
    },
    {
      protocol = "icmp"
      allow    = true
    },
    {
      protocol = "fragment"
      allow    = true
    },
    {
      protocol         = "tcp"
      destination_port = "32768-61000"
      allow            = true
      description      = "外向きTCP通信の戻りパケット"
    },
    {
      protocol         = "udp"
      destination_port = "32768-61000"
      allow            = true
      description      = "外向きUDP通信(DNS等)の戻りパケット"
    },
    {
      protocol    = "udp"
      source_port = "123"
      allow       = true
      description = "NTP"
    },
    {
      protocol    = "ip"
      allow       = false
      description = "上記以外はすべて拒否"
    },
  ]
}

# ── ディスク（Ubuntu アーカイブから作成）──
resource "sakura_disk" "main" {
  name              = "${var.server_name}-disk"
  plan              = "ssd"
  connector         = "virtio"
  size              = var.disk_size
  source_archive_id = data.sakura_archive.ubuntu.id
  zone              = var.zone
}

# ── スタートアップスクリプト ──
# 初回起動時に Node.js のインストール → git clone → ビルド → systemd 常駐化まで行う。
# LLM APIキー等の秘密情報はここに含めない(sakura_scriptの内容はTerraform stateに
# 平文で残るため)。使う場合はデプロイ後にSSHして手動で.env.localへ設定する。
resource "sakura_script" "startup" {
  name  = "${var.server_name}-startup"
  class = "shell"
  content = templatefile("${path.module}/startup.sh.tftpl", {
    repo_url    = var.repo_url
    repo_branch = var.repo_branch
  })
}

# ── サーバ本体 ──
resource "sakura_server" "main" {
  name   = var.server_name
  zone   = var.zone
  core   = var.core
  memory = var.memory
  disks  = [sakura_disk.main.id]

  # "shared" = 共有セグメント（グローバルIPが1つ付与される）
  network_interface = [{
    upstream         = "shared"
    packet_filter_id = sakura_packet_filter.main.id
  }]

  disk_edit_parameter = {
    hostname        = var.server_name
    ssh_keys        = [var.ssh_public_key]
    disable_pw_auth = true # パスワードログイン禁止（SSH鍵のみ）

    script = [{
      id = sakura_script.startup.id
    }]
  }
}
