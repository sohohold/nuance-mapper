# syntax=docker/dockerfile:1
# Sakura AppRun（共用型）向けのコンテナイメージ。
# Vercel のデプロイはこのファイルを使わない（Vercel は独自ビルドパイプラインを使用）。

FROM node:24-slim AS base
RUN corepack enable

# ── 依存関係のインストール ──
FROM base AS deps
WORKDIR /app
# postinstall (scripts/ts7-compat.cjs) が参照するので package.json/lockfile と一緒にコピーする。
# pnpm-workspace.yaml には overrides と allowBuilds があり、これが無いと
# --frozen-lockfile が lockfile との不一致で落ちる。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# ── ビルド ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── 実行 ──
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# /api/health が返すビルド識別子。通常はコミットSHAを渡す。
# タグを使い回した際に古いイメージが動き続けても気づけるようにするためのもので、
# 未指定でも空文字のまま動作する。
ARG BUILD_REVISION=""
ENV BUILD_REVISION=$BUILD_REVISION
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Next.js standalone 出力（next.config.ts の output: "standalone"）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
