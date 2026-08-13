// PRごとのプレビュー環境のAppRunアプリ定義（apprun-cli 用）。
// 値はすべて環境変数から受け取る。使う側は .github/workflows/preview-sakura.yml。
//
// 本番（terraform/apprun）とは別のアプリとして作る。AppRunの公開URLはアプリ単位で
// 発行され、バージョン単位のURLは存在しないため、隔離されたプレビューを作る方法は
// 「アプリごと作って捨てる」以外にない。
local must_env = std.native('must_env');

local name = must_env('PREVIEW_APP_NAME');

{
  name: name,
  port: 3000,
  // 本番と同じ理由で180秒（AppRunの上限は300秒）。
  timeout_seconds: 180,
  // アイドル時は課金されない。復帰に9秒前後かかるが、プレビューでは許容する。
  min_scale: 0,
  max_scale: 1,

  components: [{
    name: name,
    max_cpu: '0.5',
    max_memory: '1Gi',

    deploy_source: {
      container_registry: {
        // digest 指定。AppRunのバージョンは構成情報のスナップショットなので、
        // 参照文字列が変わらないと新しいバージョンが作られない。digestなら
        // 中身が変われば必ず文字列も変わるため、その失敗が原理的に起きない。
        image: must_env('PREVIEW_IMAGE'),
        server: 'docker.io',
        username: must_env('DOCKERHUB_USERNAME'),
        password: must_env('DOCKERHUB_TOKEN'),
      },
    },

    // 空値を除いた環境変数の配列。組み立てはワークフロー側（jq）で行う。
    env: std.parseJson(must_env('PREVIEW_ENV_JSON')),

    // `/` はプレビューのBasic認証（src/proxy.ts）が401を返すため使えない。
    // /api/health は認証の matcher から除外してある。
    probe: {
      http_get: {
        path: '/api/health',
        port: 3000,
      },
    },
  }],
}
