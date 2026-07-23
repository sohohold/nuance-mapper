# さくらのクラウドへの Terraform デプロイ手順

[sacloud/sakura](https://registry.terraform.io/providers/sacloud/sakura/latest) プロバイダを使って、
このリポジトリの Next.js アプリ（nuance-mapper）をさくらのクラウド上の Ubuntu サーバにデプロイする構成です。

## 作られるもの

| リソース | 内容 |
| --- | --- |
| `sakura_server` | 2コア / 4GiB の仮想サーバ（共有セグメント接続、グローバルIP 1つ） |
| `sakura_disk` | Ubuntu 最新パブリックアーカイブから作った 20GiB SSD |
| `sakura_packet_filter(_rules)` | SSH(22) と HTTP(80) だけ受け付けるファイアウォール |
| `sakura_script` | 初回起動時に Node.js 24 導入 → `git clone` → `pnpm build` → systemd 常駐化まで自動実行 |

> **料金に注意**: `terraform apply` した時点から課金が始まります（このスペックで月数千円程度、時間割あり）。
> 試し終わったら `terraform destroy` で全削除できます。

## 0. 前提

- [さくらのクラウド](https://cloud.sakura.ad.jp/)のアカウント
- SSH 鍵ペア（なければ `ssh-keygen -t ed25519` で作成）
- Terraform **1.11 以上**（[インストール手順](https://developer.hashicorp.com/terraform/install)。macOS なら `brew install terraform`）

## 1. APIキーを発行して環境変数に設定

さくらのクラウドのコントロールパネル → 右上のアカウント名 → **APIキー** → 「追加」で
アクセストークンとシークレットを発行し、ターミナルで環境変数に設定します:

```bash
export SAKURA_ACCESS_TOKEN="発行したトークン"
export SAKURA_ACCESS_TOKEN_SECRET="発行したシークレット"
```

Terraform はこの環境変数を自動で読むので、`.tf` ファイルに書く必要はありません（書かないでください）。

## 2. 変数ファイルを作る

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` を開いて、最低限 `ssh_public_key` に自分の公開鍵
（`cat ~/.ssh/id_ed25519.pub` の出力）を貼り付けます。
LLM の API キーを持っていれば同じファイルに設定できます（未設定でもモックデータで動きます）。

## 3. デプロイする（Terraform の基本 3 コマンド）

```bash
terraform init    # 初回のみ: プロバイダのダウンロード
terraform plan    # 何が作られるかのプレビュー（まだ何も起きない）
terraform apply   # 実際に作成。内容を確認して yes と入力
```

`apply` が終わると IP アドレスなどが出力されます:

```
app_url     = "http://203.0.113.10/"
ip_address  = "203.0.113.10"
ssh_command = "ssh ubuntu@203.0.113.10"
```

サーバ起動後、初回セットアップ（Node.js インストール + ビルド）に **5〜10分** かかります。
その間 `app_url` は応答しないので少し待ってください。

## 4. 動作確認・トラブルシューティング

```bash
ssh ubuntu@<ip_address>

# セットアップの進行ログ
sudo tail -f /var/log/nuance-mapper-setup.log

# アプリの状態とログ
systemctl status nuance-mapper
sudo journalctl -u nuance-mapper -f
```

## 5. 変更の反映と後片付け

- **スペック変更**: `terraform.tfvars` の `core` / `memory` などを変えて再度 `terraform apply`
- **アプリの更新**: サーバに SSH して `cd /opt/nuance-mapper && sudo -u app -H git pull && sudo -u app -H pnpm install && sudo -u app -H pnpm build && sudo systemctl restart nuance-mapper`
- **全削除（課金停止）**:

```bash
terraform destroy   # 内容を確認して yes
```

## よくあるハマりどころ

- **`Error: 401` / 認証エラー** — 手順 1 の環境変数が現在のターミナルに設定されているか `echo $SAKURA_ACCESS_TOKEN` で確認。
- **`terraform.tfstate` は消さない・コミットしない** — Terraform が「今何が作られているか」を記録する台帳です。消すと Terraform がリソースを管理できなくなります（`.gitignore` 済み）。
- **プライベートリポジトリの場合** — サーバ上の `git clone` が失敗します。`repo_url` にトークン付き URL（`https://<token>@github.com/...`）を設定するか、リポジトリを公開してください。
- **HTTPS 化したい** — この構成は HTTP のみです。独自ドメイン + HTTPS が必要なら、systemd ユニットの待ち受けを 3000 番に変えた上で、サーバに [Caddy](https://caddyserver.com/) を入れて 80/443 → 3000 のリバースプロキシにするのが手軽です（パケットフィルタの 443 開放も忘れずに）。
