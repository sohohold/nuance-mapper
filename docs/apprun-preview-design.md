# AppRun プレビュー環境 設計メモ

GitHub の PR ごとに、さくらのクラウド AppRun（共用型）へ使い捨てのプレビュー環境を払い出す仕組みの設計。実装前の要件整理と、検証が必要な項目の一覧。

一次情報は [技術概要（AppRun）](https://manual.sakura.ad.jp/cloud/apprun/glossary.html)（2026年6月25日更新）を参照。仕様改定が速いサービスなので、実装時と執筆時にそれぞれ再確認する。

## 0. 前提の再確認で分かったこと

| 項目 | 確認結果 | 影響 |
| --- | --- | --- |
| 外部レジストリ | さくらのCRに加えて **Docker Hub / GHCR が利用可能** | 記事下書きの「将来対応」は古い。前提を書き換える |
| 公開URL | **アプリケーション単位**で自動発行。バージョン別URLは無い | プレビュー = アプリごと使い捨て、が唯一の選択肢 |
| アプリケーション数 | **最大5 / プロジェクト**（緩和申請可） | 本番1 + プレビュー4本が上限。設計の中心制約 |
| バージョン数 | 最大5 / アプリ。超過分は古い順に自動削除 | 同一PRへの再pushは自動でローテートされる。対応不要 |
| コンポーネント数 | 1 / アプリ | サイドカー不可。DBやRedisは外部（Upstash）のまま |
| トラフィック分散 | 最大4バージョン、割合(%)指定のみ | カナリアはできるがプレビュー用途には使えない |
| パケットフィルタ | 最大10 IP / アプリ | 固定IPからのアクセス制限には使えるが、CIランナーには不向き |
| イメージ | linux/amd64、2GiB以下 | Next.js standalone なら余裕 |
| リクエストタイムアウト | 1〜300秒 | 現行 `timeout_seconds = 180` は範囲内 |
| 起動タイムアウト | 4分 | コールドスタート計測の上限値として使える |
| 環境変数 | 最大50個、値は512バイトまで | 現状の6変数は問題なし |

## 1. 全体フロー

```mermaid
flowchart TD
    L[PR に preview ラベル] --> B[docker buildx build]
    B -->|cache: type=gha| B
    B --> H[Docker Hub へ push<br/>tag: pr-N-SHA]
    H --> A[AppRun アプリ作成/更新<br/>name: nuance-mapper-pr-N]
    A --> C[PR に sticky comment + Deployments API]
    X[PR close / merge] --> D[AppRun アプリ削除]
    D --> T[Docker Hub のタグ削除]
    W[週次 cron] --> G[取りこぼし棚卸し]
```

本番（`terraform/apprun`）は Terraform のまま据え置き、プレビューは state を持たない [apprun-cli](https://github.com/fujiwara/apprun-cli) で作る。PRごとに state ファイルを切って close 時に消す手間が要らず、`deploy` / `delete` / `url` の3コマンドで完結するため。

## 2. コンテナレジストリを Docker Hub へ

マニュアルの「利用可能なコンテナレジストリ」に Docker Hub が明記されているため実現可能。ただし無料プラン（Personal）の制約が効く。

- **private リポジトリは1つ、容量2GiB まで**。本番とプレビューを同一リポジトリのタグで分ける（`user/nuance-mapper:prod-<sha>` / `:pr-123-<sha>`）
- タグ間でレイヤは共有されるが、アプリ層だけでも1タグ数十MB積み上がる。**タグ削除は必須**。PR close 時に該当タグを削除し、週次で棚卸しする
- 認証付き pull は 200回 / 6時間。`min_scale = 0` のプレビューが再pullを繰り返した場合に当たる可能性があるため、レート制限の挙動は実測して記事の論点にする
- public リポジトリにすればこれらの制約は消えるが、ビルド成果物が公開される。プレビュー用途では private を維持する

**要検証（実装の最初のブロッカー）**: `deploy_source.container_registry` の `server` に Docker Hub を指定する際の正しい値。候補は `docker.io` / `index.docker.io` / `registry-1.docker.io`。`image` は `<user>/nuance-mapper:<tag>` か FQDN 付きか。private からの pull に Personal Access Token が使えるかも併せて確認する。

さくらのコンテナレジストリの月額はコスト削減の根拠になるので、料金ページから実額を控えて記事に載せる（TODO）。

## 3. buildx + registry cache の要件

結論として、**今回は `type=registry` ではなく `type=gha`（GitHub Actions Cache）を使う**。Docker Hub 無料枠の 2GiB をキャッシュイメージで食い潰すため。

キャッシュのエクスポートに必要な条件は2つ。

1. **buildx のドライバが `docker-container` であること**。素の `docker build`（`docker` ドライバ）はキャッシュの export に対応していない。`docker/setup-buildx-action` を入れれば既定で満たされる
2. **`mode=max` を指定すること**。既定の `mode=min` は最終ステージしか保存しないため、`deps` / `builder` 段が効かない

現行 Dockerfile は `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` を先に COPY してから `pnpm install` しているので、レイヤキャッシュがそのまま効く。追加の書き換えは不要。

注意点:

- GHA キャッシュはリポジトリあたり10GBを共有し、**ブランチスコープ**を持つ。PRブランチは base（main）のキャッシュを読めるが、PR同士では共有されない。main への push で通常のビルドを回してキャッシュを温めておくと、各PRの初回ビルドが速くなる
- `RUN --mount=type=cache` の内容（pnpm store や `.next/cache`）は registry / gha キャッシュにエクスポートされない。Next.js のビルドキャッシュまで効かせたい場合は `actions/cache` で `.next/cache` を別途復元する必要があるが、複雑さに見合わないので初期実装では見送る
- `platforms: linux/amd64` を明示する。AppRun は amd64 のみ

## 4. Vercel のような bot は必要か

**不要。** GitHub App を作らずに Vercel 相当の PR 上の見え方を作れる。

- **Deployments API**（`permissions: deployments: write`）でデプロイを登録すると、PRのタイムラインに環境名と「View deployment」ボタンが出る。Vercel の見た目に一番近いのはこれ
- **sticky comment**（`permissions: pull-requests: write`）でURL・イメージタグ・デプロイ時刻を1つのコメントに上書き更新する。push のたびにコメントが増えない
- `github-actions[bot]` が付けたコメントは他のワークフローをトリガしないので、ループの心配はない

GitHub App が要るのは、別リポジトリへ書き込む場合、Checks API で独自チェックを出す場合、bot 名義を変えたい場合、Actions の外から操作する場合。今回はどれにも当たらない。

fork からの PR では `GITHUB_TOKEN` が read-only になりコメントできないが、後述のラベル起動方式なら自分のブランチのPRが対象なので実害はない。`pull_request_target` は任意コード実行につながるので使わない。

## 5. プレビューを非公開にする

AppRun には Vercel の Deployment Protection に相当する機能がない。**アプリ層で Basic 認証を実装する**のが現実的。**実装済み**（`src/proxy.ts`）。

- 環境変数 `PREVIEW_BASIC_AUTH_USER` / `PREVIEW_BASIC_AUTH_PASSWORD` が**両方**設定されている時だけ401を返す。本番はどちらも入れないので素通りする
- 認証を通った応答には `X-Robots-Tag: noindex, nofollow` を付ける
- パケットフィルタ（最大10 IP）は補助。GitHub Actions ランナーの egress IP は動的なので、CIからスモークテストを叩く構成とは相性が悪い

**落とし穴（対処済み）**: AppRun のヘルスチェックは `path = "/"` を叩いていた。認証が `/` に401を返すとヘルスチェックが通らず、バージョンが健全と判定されない。`/api/health` を追加して matcher から除外し、probe のパスを本番・プレビュー両方で `/api/health` に変更した。`/` はページ全体をレンダリングするため、ヘルスチェック先としてもそもそも重い。

**Next.js 16 の注意**: `middleware.ts` は非推奨になり `proxy.ts`（エクスポート名も `proxy`）へ改名された。proxy は Node.js ランタイム固定で edge を選べず、ルートセグメント設定（`export const runtime` 等）も書けない。Node ランタイムなので `node:crypto` の `timingSafeEqual` がそのまま使える。

## 6. 本番稼働中にプレビューを削除できるか

**できる。むしろ削除が必須。**

マニュアルの削除制限は「バージョン」に対するもの（トラフィック向き先・最新・唯一のバージョンは削除不可）で、**アプリケーション単位の削除には制限がない**。プレビューは本番とは別アプリなので、本番へ一切影響しない。

- PR close / merge をトリガに `apprun-cli delete`
- ワークフロー失敗による取りこぼしに備え、週次 cron で `apprun-cli list` を取り、対応するPRが閉じている `nuance-mapper-pr-*` を掃除する
- **要検証**: アプリ名は同一ユーザー内で一意。削除が非同期の場合、同じPRをreopenして同名で作り直すと衝突しうる。リトライを入れるか、タグにSHAを含めた名前にするかを実測で決める

## 7. アプリ数上限（最大5 / プロジェクト）の扱い

この制約が設計全体を決める。**本番1 + プレビュー最大4本**。

対応方針:

1. **`preview` ラベルを付けたPRだけ環境を作る**（`types: [labeled, synchronize]`）。手動オプトインにすることで自然に本数が絞られ、README にある「使いたい時だけ起動して費用を抑える」方針とも合う
2. **空きが無い場合は失敗させ、PRにコメントで通知する**。他のPRのプレビューを自動で消す実装は事故のもとなので採らない
3. 上限緩和はサポートへの申請が可能とマニュアルに明記がある。申請の可否と所要日数まで書ければ記事のオリジナリティになる
4. **要検証**: 制限のスコープが「プロジェクトごと」なので、プレビュー専用のプロジェクトを分ければ別枠の5つを確保できる可能性がある。ただしアプリ名の一意性は「同一ユーザー内」なので名前空間は跨って共有される点に注意

バージョン数（最大5/アプリ）は超過時に古い順で自動削除されるため、同一PRへの再pushでは何もしなくてよい。トラフィックは常に最新バージョンへ100%向ける（本番の `traffics` と同じ構成）。

## 8. 記事に向けた計測・記録項目

実装しながら以下を残す。後から取り直すのは高くつく。

- コールドスタート時間（`min_scale = 0` からの初回レスポンス）。イメージサイズ別に数点
- プレビュー1本あたりのデプロイ所要時間（buildキャッシュあり/なし）
- アプリ作成〜公開URLが応答するまでのラグ
- 失敗モード: ヘルスチェック不通過時の挙動、起動タイムアウト4分に当たるケース、アプリ数上限に当たった時のAPIレスポンス
- Docker Hub の pull レート制限に当たるか
- さくらのコンテナレジストリと Docker Hub の月額差

記事の軸は「単発デプロイ」ではなく、**アプリ数上限5という制約の下でプレビュー環境のライフサイクルをどう設計するか**に置く。Vercel が隠している仕事（払い出し・保護・回収・上限管理）を自分で組むと何が見えるか、という構成。

## 9. 実装順序

1. Docker Hub をデプロイソースにできるか手動で確認（`server` の値の特定）
2. ~~`/api/health` 追加 + 認証（`src/proxy.ts`）+ 本番 probe パスの変更~~ 完了
3. 本番を Docker Hub に切り替え（`terraform/apprun`）
4. `preview-sakura.yml`（ラベル起動、build → push → apprun-cli deploy → コメント/Deployments）
5. `preview-cleanup-sakura.yml`（PR closed でアプリ・タグ削除）
6. 週次棚卸し cron
7. README / 記事用の計測メモ

## 10. 検証ログ

実機で確かめた事実だけを書く。推測は「未確認」と明記する。

### 2026-08-13 Docker Hub をデプロイソースにする

捨てアプリ（`app-dfab579c-…`）に `docker.io/sauroctone/nuance-mapper:hello`（中身は Docker 公式 `hello-world`、public リポジトリ）を指定して確認した。

確認できたこと:

- **Docker Hub からの pull は成功する。** コンテナが起動し hello-world の出力がログに出た
- **`server` に指定できるのは `docker.io` だけ。** `index.docker.io` と `registry-1.docker.io` はコントロールパネル側のバリデーションで弾かれる。レジストリのホスト名を自由に書ける欄ではなく、事実上の選択肢として振る舞う
- **`image` にはレジストリのプレフィックスが必須。** `sauroctone/nuance-mapper:hello` のような Docker Hub の短縮形は通らず、`docker.io/` から書く必要がある
- private リポジトリからの pull は未確認（この検証は public で実施した）

観測した失敗モード:

- `hello-world` は標準出力に書いて即 exit するためポートを待ち受けない。結果、**ヘルスチェックが一度も通らず、バージョンの状態が「処理中」から進まない**
- コンテナは終了するたびに再起動され、同じログが数分おきに繰り返し出る（16:49 / 16:58 / 17:01）。**「起動タイムアウト4分」で失敗として打ち切られる様子はなく、処理中のまま留まり続けた**。マニュアルの記述と実挙動の差として要追記
- 状態が「処理中」の間、公開URLは応答しない

### 未確認・要検証

- **トラフィック0%のバージョンはインスタンスが作られないのではないか。** マニュアルは「インスタンスはトラフィックが割り当てられたバージョンをもとに作成」「バージョンステータスはヘルスチェックの結果で更新」と書いている。この2つを素直に読むと、新バージョンはトラフィックを振るまで起動せず、起動しないのでヘルスチェックも走らず、状態が確定しない。**「新バージョンの健全性を確認してから切り替える」というblue/greenが成立しない**ことになるため、挙動を確定させる価値が高い
- **同一タグの上書き push では新バージョンが作られない可能性。** バージョンは「構成情報が1つでも変化した時」に作られる。イメージ参照文字列が変わらない上書き push は構成情報の変化にあたらないため、古いイメージのまま据え置かれるはず。CIでコミットSHAをタグに使う設計上の理由になる（本番の `deploy-sakura.yml` は既にそうしている）
- **壊れたアプリからの復旧経路。** バージョンの削除制限（トラフィック向き先・最新・唯一のバージョンは削除不可）により、バージョンが1つしかない壊れたアプリは**バージョン単位では直せず、アプリごと削除するしかない**はず。アプリ数上限5と組み合わさると、検証中に枠を潰したまま復旧できない状況が起きうる
