# Docker Hub APIのタグ操作。デプロイとプレビューの各ワークフローから読み込んで使う。
#
#   source .github/scripts/dockerhub.sh
#   jwt=$(dockerhub_login)
#   tags=$(dockerhub_tags "$jwt" "someone/nuance-mapper")
#
# 認証情報は DOCKERHUB_USERNAME と DOCKERHUB_TOKEN を環境変数から読む。
# シェルオプションはここでは変更しない（呼び出し側のstepに影響するため）。

DOCKERHUB_API="https://hub.docker.com/v2"

# 1ページ100件。応答が壊れて next が止まらない場合に備えて上限を設ける。
DOCKERHUB_MAX_PAGES=20

# JWTを標準出力へ。失敗時は空文字を返すので、呼び出し側で判定すること。
dockerhub_login() {
  curl -sS -X POST "${DOCKERHUB_API}/users/login/" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg u "$DOCKERHUB_USERNAME" --arg p "$DOCKERHUB_TOKEN" \
      '{username: $u, password: $p}')" \
    | jq -r '.token // empty'
}

# 全ページのタグをJSON配列で標準出力へ。
# 1ページ目だけを見て絞り込むと、対象が後続ページに残って取りこぼす。
dockerhub_tags() {
  local jwt="$1" repo="$2"
  local next="${DOCKERHUB_API}/repositories/${repo}/tags/?page_size=100"
  local acc="[]" page i

  for ((i = 0; i < DOCKERHUB_MAX_PAGES; i++)); do
    [ -n "$next" ] || break
    page=$(curl -sS -H "Authorization: JWT ${jwt}" "$next")
    acc=$(jq -c -n --argjson acc "$acc" --argjson page "$page" \
      '$acc + ($page.results // [])')
    next=$(printf '%s' "$page" | jq -r '.next // empty')
  done

  printf '%s' "$acc"
}

# 指定したタグを削除する。HTTPステータスをログに出すだけで、失敗しても停止しない。
# 掃除の失敗でデプロイやプレビューを落とす価値はない。
dockerhub_delete_tags() {
  local jwt="$1" repo="$2"
  shift 2
  local tag code

  for tag in "$@"; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: JWT ${jwt}" \
      "${DOCKERHUB_API}/repositories/${repo}/tags/${tag}/")
    echo "delete ${tag} -> ${code}"
  done
}
