import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker (Sakura AppRun 等) 向けに standalone サーバーを出力する。
  // Vercel はこの設定を無視するので影響なし。
  output: "standalone",
  typescript: {
    // TypeScript 7 removed the programmatic API that Next.js uses for
    // built-in type checking. We run `tsc --noEmit` separately instead.
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
