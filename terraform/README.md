# さくらのクラウドへのデプロイ（2方式）

このディレクトリには、nuance-mapper をさくらのクラウドへデプロイする方法が2つあります。
どちらも学習・ポートフォリオ用途を想定しており、**実運用はVercel**を前提としています。

| | [`server/`](./server/) | [`apprun/`](./apprun/) |
|---|---|---|
| 方式 | Ubuntu VM + systemd | コンテナ + AppRun(共用型) |
| デプロイ | `terraform apply`（手動、ローカルから） | GitHub Actions（手動トリガー） |
| コンテナレジストリ | 使わない | 使う |
| 課金 | 常時定額（約5,060円/月） | 従量課金・アイドル時ほぼ0円 |
| 学べること | 伝統的なVM運用（systemd, パケットフィルタ, SSH） | コンテナ・レジストリ・サーバーレス・CI/CD |

先に試すなら費用が安く抑えられる `apprun/` がおすすめです。
それぞれの詳しい手順は各ディレクトリのREADMEを参照してください。

## 共通の注意点

- **`terraform apply`した時点から課金されます**。使い終わったら必ず`terraform destroy`(または対応するGitHub Actionsのdestroyワークフロー)で削除してください。
- **リソースの削除はさくらのクラウドのWebUIから直接行わないでください。** Terraformが管理しているリソースをWebUIで消すと、Terraformのstateと実際の状態がズレて次回操作でエラーになります。削除は必ずTerraform経由で。
- 認証情報(`SAKURA_ACCESS_TOKEN`など)は`.tf`ファイルに書かず、環境変数やGitHub Secretsで渡します。
