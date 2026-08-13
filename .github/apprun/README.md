# PRごとのプレビュー環境

同一リポジトリ内でPRを作ると、さくらのクラウドAppRun上へ独立したプレビュー環境を自動で払い出します。pushのたびに更新し、PRを閉じると削除します。

| ファイル | 役割 |
| --- | --- |
| [`preview.jsonnet`](./preview.jsonnet) | apprun-cli に渡すアプリ定義 |
| [`../workflows/preview-sakura.yml`](../workflows/preview-sakura.yml) | ビルド → push → デプロイ → 検証 → PRへ報告 |
| [`../workflows/preview-cleanup-sakura.yml`](../workflows/preview-cleanup-sakura.yml) | AppRunアプリとDocker Hubタグの削除、Deploymentの無効化 |
| [`../scripts/dockerhub.sh`](../scripts/dockerhub.sh) | Docker Hub APIのタグ操作（3つのワークフローで共用） |
| [`../scripts/apprun-secrets.sh`](../scripts/apprun-secrets.sh) | プレビューではBasic認証、本番ではLLM・Redisの機密値をAppRunのsecretへ同期 |

本番デプロイ（`terraform/apprun`）とは別系統です。本番はTerraform、プレビューはapprun-cliで、stateを共有しません。

## 上限

**同時に持てるプレビューは最大4本です。** AppRunのアプリケーション数はプロジェクトあたり5が上限で、本番が1つ使うためです。

枠が埋まった状態で新しいプレビューを作ろうとすると、ワークフローはエラーで停止します。他のPRのプレビューを自動で削除することはしません。不要なPRを閉じて枠を空けてください。

上限の緩和はさくらのサポートへ申請できます。

## 初回設定

### 1. Basic認証の認証情報を登録する

Settings → Secrets and variables → Actions → Repository secrets に2つ追加します。

| Secret | 値 |
| --- | --- |
| `PREVIEW_BASIC_AUTH_USER` | 任意の文字列。**コロン `:` を含めないこと**（Basic認証はコロンでユーザー名とパスワードを区切るため） |
| `PREVIEW_BASIC_AUTH_PASSWORD` | 十分に長いランダム文字列。`openssl rand -base64 24` などで生成する |

**両方が揃っていないとワークフローはビルド前に停止します。** 加えて、初期デプロイには非機密の `PREVIEW_AUTH_REQUIRED=true` を設定します。[`src/proxy.ts`](../../src/proxy.ts) はこのフラグがあるのに資格情報が揃っていない場合、リクエストを通さず503を返します。そのため、AppRun secretへのパスワード同期中や同期失敗時もプレビューは公開状態になりません。

登録後は値を読み出せません。プレビューを開くときにブラウザの認証ダイアログへ入力するので、控えておいてください。

### 2. デプロイ用SecretsとVariableを流用する

`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` / `SAKURA_ACCESS_TOKEN` / `SAKURA_ACCESS_TOKEN_SECRET` は本番デプロイと共通ですが、信頼済みのbase branch workflow内でDocker HubへのpushとAppRun API操作だけに使い、PRイメージの環境変数には設定しません。

LLMのAPIキーとUpstashの認証情報はプレビューへ渡しません。PRコードは任意の通信やrouteを実装でき、アプリ内のBasic認証ではシークレット流出を防ぐ信頼境界にならないためです。プレビューの生成APIはモックデータを返します。

Repository variable `APPRUN_SECRET_VERSION` も本番と共用します。Basic認証パスワードをローテーションしたらこの値を増やしてください。

既存Previewではデプロイ前にsecretを同期してから同じ版番号をCLIへ渡します。新規作成または非Healthyで事前同期を延期した場合は、デプロイ後の同期を強制するため、版番号だけが先に進んで古いsecret値を同期済みと誤認することはありません。

## 使い方

PRを作ると `nuance-mapper-pr-<PR番号>` というAppRunアプリが作られます。以降そのPRへpushするたびに更新されます。

結果はPRのコメント1つに書き込まれ、pushのたびに上書きされます。同時にGitHubのDeployments APIへ登録するので、PRのタイムラインからも環境へ移動できます。

初回アクセスはスケールゼロからの復帰で10秒ほどかかります。

## 設計

| 項目 | 選択 | 理由 |
| --- | --- | --- |
| 単位 | PRごとに独立したAppRunアプリ | 公開URLはアプリ単位でしか発行されず、バージョン別URLが存在しないため |
| 起動条件 | 同一リポジトリの全PR | Vercel Preview同様、作成とpushのたびに自動更新する |
| イメージ参照 | digest（`@sha256:...`） | AppRunのバージョンは構成情報のスナップショットで、参照文字列が変わらないと新しいバージョンが作られない。digestなら取り違えが原理的に起きない |
| デプロイ手段 | apprun-cli | PRごとのTerraform stateを作って壊す手間が要らない |
| ビルドキャッシュ | `type=gha,mode=max` | レジストリキャッシュはDocker Hub無料枠の2GiBを圧迫する |
| workflowの信頼境界 | `pull_request_target`のbase branch | PRコードをbuild contextに限定し、PRがデプロイ定義やシークレット同期処理を書き換えられないようにする |
| アクセス制限 | fail-closedなアプリ層のBasic認証 | AppRunにVercelのDeployment Protection相当の機能がない。パスワード同期前は503、同期後はBasic認証で保護する。ただし本番資格情報の保護には使わない |

デプロイ後に、`/api/health` の `revision` が期待するコミットSHAと一致すること（古いイメージが動いていないか）、`GET /` と `POST /api/generate` がどちらも401を返すことを検証します。いずれかが崩れていればプレビューアプリを削除します。

## 制限

- **forkからのPRでは動きません。** job条件で同一リポジトリのPRだけに限定しています。`pull_request_target`を使いますが、PR checkoutは資格情報を残さない独立ディレクトリへ置き、実行対象にはせずDocker build contextとしてだけ扱います
- 同時に5本目のPRを開いた場合はAppRun上限により作成できません。古いプレビューを勝手に消さず、capacity checkで失敗します
- 削除は取りこぼす可能性があります。上限が5しかないので、定期的に `apprun-cli list` で `nuance-mapper-pr-` から始まるアプリを確認してください
- Docker Hubの無料プランはprivateリポジトリ1つ・2GiBまでです。同じPRへのpushで増える古いタグはデプロイ成功のたびに整理し、PRを閉じた時点で残りを削除しますが、クリーンアップ自体が失敗した場合はタグが残ります
