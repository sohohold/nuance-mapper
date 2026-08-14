// PRごとに独立したAppRunアプリを作成する。値は環境変数から受け取る。
// AppRunはバージョン単位のURLを発行しないため、プレビューごとにアプリが必要になる。
local must_env = std.native('must_env');

local name = must_env('PREVIEW_APP_NAME');

{
  name: name,
  port: 3000,
  timeout_seconds: 180,
  min_scale: 0,
  max_scale: 1,

  components: [{
    name: name,
    max_cpu: '0.5',
    max_memory: '1Gi',

    deploy_source: {
      container_registry: {
        // AppRunに構成変更を認識させるため、イメージをdigestで指定する。
        image: must_env('PREVIEW_IMAGE'),
        // Docker Hubの認証先にはindex.docker.ioが必要。docker.ioではAPIが400を返す。
        server: 'index.docker.io',
        username: must_env('DOCKERHUB_USERNAME'),
        password: must_env('DOCKERHUB_TOKEN'),
      },
    },

    env: std.parseJson(must_env('PREVIEW_ENV_JSON')),

    // `/` はBasic認証で401を返すため、認証対象外のhealth routeを使用する。
    probe: {
      http_get: {
        path: '/api/health',
        port: 3000,
      },
    },
  }],
}
