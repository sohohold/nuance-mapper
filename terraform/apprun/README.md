# Sakura AppRun（共用型）+ コンテナレジストリ + GitHub Actions

`terraform/server/`(VM方式)とは別の、コンテナベースのデプロイ構成です。
GitHub Actions から**手動トリガー**で「Dockerビルド → コンテナレジストリへpush → AppRunへデプロイ」
を一気に行えます。`main`へのmergeでは自動デプロイしません(実運用はVercelのため)。

## 構成

```
GitHub Actions (workflow_dispatch)
  ├─ docker build/push → sakura_container_registry (220円/月, 5GiB)
  └─ terraform apply    → sakura_apprun_shared (min_scale=0: アイドル時ほぼ0円)
```

Terraformのstateは**さくらのオブジェクトストレージ(S3互換)**に保存します
(GitHub Actionsのランナーは使い捨てのため、ローカルにstateを置けません)。

## 事前準備(初回のみ・手動)

### 1. state保存用バケットを作る

Terraform自身のstateを保存するバケットは、卵が先か鶏が先か問題により
このTerraform構成では作れません。**手動で一度だけ**作成します。

1. さくらのクラウド コントロールパネル →「オブジェクトストレージ」→ サイト利用開始
2. バケットを作成（例: `<あなたの名前>-nuance-mapper-tfstate`。世界的にユニークな名前が必要）
3. コントロールパネルの「パーミッション設定」画面からアクセスキー・シークレットキーを発行
   (サイト利用開始時に出るキーではなく、こちらを使うのが推奨)

### 2. コンテナレジストリのFQDNラベルを決める

`registry_subdomain_label`(例: `yourname-nuance-mapper`)は
さくらのクラウド全体でユニークである必要があります。早い者勝ちです。

### 3. GitHub Secrets を設定

リポジトリの Settings → Secrets and variables → Actions で以下を登録:

| Secret名 | 用途 | 必須 |
|---|---|---|
| `SAKURA_ACCESS_TOKEN` / `SAKURA_ACCESS_TOKEN_SECRET` | さくらのクラウドAPI認証 | ✅ |
| `SAKURA_OBJECT_STORAGE_ACCESS_KEY` / `SAKURA_OBJECT_STORAGE_SECRET_KEY` | Terraform state用(オブジェクトストレージ) | ✅ |
| `SAKURA_TFSTATE_BUCKET` | 手順1で作ったバケット名 | ✅ |
| `SAKURA_REGISTRY_SUBDOMAIN_LABEL` | 手順2で決めたラベル | ✅ |
| `SAKURA_REGISTRY_USERNAME` / `SAKURA_REGISTRY_PASSWORD` | レジストリの`docker login`用(自分で決める) | ✅ |
| `GEMINI_API_KEY` 等 | LLMプロバイダのAPIキー | 任意(未設定ならモックデータ) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | 永続キャッシュ | 任意 |

## デプロイ方法

GitHub の **Actions タブ → "Deploy to Sakura AppRun" → Run workflow** を押すだけです。
初回実行時にコンテナレジストリとAppRunアプリの両方が作成され、以降は新しいイメージへの
更新（新リビジョン）になります。完了すると Job Summary にアプリURLが表示されます。

## ローカルから使う場合

CIと同じ手順をローカルでも実行できます:

```bash
cd terraform/apprun
cp backend.hcl.example backend.hcl   # bucket名などを書き換える
cp terraform.tfvars.example terraform.tfvars  # registry_subdomain_label等を埋める

export SAKURA_ACCESS_TOKEN="..."
export SAKURA_ACCESS_TOKEN_SECRET="..."
export AWS_ACCESS_KEY_ID="オブジェクトストレージのアクセスキー"
export AWS_SECRET_ACCESS_KEY="オブジェクトストレージのシークレットキー"

terraform init -backend-config=backend.hcl

# イメージは事前にビルド&pushしておく
docker login <registry_subdomain_label>.sakuracr.jp -u <username>
docker build -t <registry_subdomain_label>.sakuracr.jp/nuance-mapper:local .
docker push <registry_subdomain_label>.sakuracr.jp/nuance-mapper:local

terraform apply -var="image_tag=local"
```

## 削除(destroy)

**さくらのクラウドのWebUIやusacloudから直接削除しないでください。**
Terraformのstateと実際のリソースがズレて、次回applyがエラーになったり
リソースが再作成されたりします。削除は必ずTerraform経由で行います。

- **GitHub Actions**: Actions タブ →「Destroy Sakura AppRun」→ Run workflow →
  confirm欄に `destroy` と入力して実行(誤爆防止のガードが入っています)
- **ローカル**: 上記のローカルセットアップ後に `terraform destroy`

いずれもAppRunアプリとコンテナレジストリの両方が削除されます
(オブジェクトストレージのstateバケット自体は手動作成なので、不要なら別途手動で削除してください)。

## 料金の目安(石狩ゾーン, 税込, 概算)

| リソース | 目安 |
|---|---|
| コンテナレジストリ | 220円/月(5GiB) |
| AppRun共用型(`min_scale=0`) | アイドル時ほぼ0円。実際にアクセスがあった分だけ課金 |

`terraform/server/`のVM方式（2コア/4GB + ディスクで約5,060円/月・常時課金）と比べて、
デモ・ポートフォリオ用途では大幅に安くなります。正確な単価は
[料金シミュレーション](https://cloud.sakura.ad.jp/payment/simulation/)で確認してください。
