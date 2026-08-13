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

# JWTを標準出力へ。失敗時は空文字を返す（呼び出し側で判定すること）。
#
# 呼び出し元のstepは errexit で動くため、ここで失敗を漏らすとstep全体が落ちる。
# デプロイ済みの本番が「タグ整理に失敗した」だけで赤くなるのは筋が悪いので、
# 通信断もJSONとして壊れた応答も、この関数の内側で空文字に畳む。
dockerhub_login() {
  local response token

  response=$(curl -sS --max-time 30 -X POST "${DOCKERHUB_API}/users/login/" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg u "$DOCKERHUB_USERNAME" --arg p "$DOCKERHUB_TOKEN" \
      '{username: $u, password: $p}')") || return 0

  token=$(printf '%s' "$response" | jq -r '.token // empty' 2>/dev/null) || return 0
  printf '%s' "$token"
}

# 全ページのタグをJSON配列で標準出力へ。
# 1ページ目だけを見て絞り込むと、対象が後続ページに残って取りこぼす。
#
# 途中で失敗した場合は、集まった分を返さずに非ゼロで戻る。不完全な一覧をもとに
# 削除対象を決めると、消してはいけないタグを消しうるため。
dockerhub_tags() {
  local jwt="$1" repo="$2"
  local next="${DOCKERHUB_API}/repositories/${repo}/tags/?page_size=100"
  local acc="[]" page i

  for ((i = 0; i < DOCKERHUB_MAX_PAGES; i++)); do
    [ -n "$next" ] || break

    page=$(curl -sS --max-time 60 -H "Authorization: JWT ${jwt}" "$next") || return 1
    printf '%s' "$page" | jq empty > /dev/null 2>&1 || return 1

    acc=$(jq -c -n --argjson acc "$acc" --argjson page "$page" \
      '$acc + ($page.results // [])') || return 1
    next=$(printf '%s' "$page" | jq -r '.next // empty') || return 1
  done

  printf '%s' "$acc"
}

# 指定したタグを削除する。HTTPステータスをログに出すだけで、失敗しても停止しない。
# 掃除の失敗でデプロイやプレビューを落とす価値はない。
#
# curl自体が失敗した場合（DNS・接続・タイムアウト）も、呼び出し元のstepを
# 巻き込まないよう関数内で吸収し、残りのタグの削除を続ける。
dockerhub_delete_tags() {
  local jwt="$1" repo="$2"
  shift 2
  local tag code

  for tag in "$@"; do
    if code=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: JWT ${jwt}" \
      "${DOCKERHUB_API}/repositories/${repo}/tags/${tag}/"); then
      echo "delete ${tag} -> ${code}"
    else
      echo "::warning::タグ ${tag} の削除に失敗しました（通信エラー）"
    fi
  done
}
