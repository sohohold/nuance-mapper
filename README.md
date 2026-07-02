This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Configuration

Copy `.env.example` to `.env.local` and set the keys you have. All settings
are optional — with no LLM key the API returns mock data.

### LLM providers ($0 operation)

The generate API tries providers in a hedged ladder:
**Gemini → Groq → Cerebras → OpenRouter**. Only providers whose env key is
set participate. For Gemini/Groq/Cerebras the concrete model is picked at
runtime: each rung has a latency/throughput-ordered preference list that is
matched against the provider's live `/models` endpoint (cached for 1 hour),
so deprecated or renamed models degrade gracefully instead of 404ing.

| Env var | Provider | Preferred models (fastest first) | Free tier (approx.) |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Google AI Studio | `gemini-flash-lite-latest` → `gemini-flash-latest` → pinned 2.5 ids | ~15 RPM / 1,000+ req/day |
| `GROQ_API_KEY` | Groq | `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `llama-3.3-70b-versatile` | 30 RPM / 1,000 req/day |
| `CEREBRAS_API_KEY` | Cerebras | `gpt-oss-120b` → `zai-glm-4.7` → `qwen-3-32b` → `llama-3.3-70b` | 1M tokens/day |
| `OPENROUTER_API_KEY` | OpenRouter | `openai/gpt-oss-120b:free` only (all `:free` models share one daily pool) | 50 req/day shared (1,000/day after a one-time $10 credit purchase) |

Each provider has its own independent daily quota, so every additional key
multiplies availability. To guarantee $0, use keys from accounts **without
billing enabled** (no credit card on file) — those cannot be charged; once
the free quota runs out, requests fail and the ladder moves on. Note that
the Gemini/Groq/Cerebras rungs use normal metered model IDs, so a key from
a billing-enabled account may incur charges beyond the free tier.

### Persistent cache

Results are cached for **30 days**. Set Upstash Redis REST credentials
(`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the Vercel KV
equivalents `KV_REST_API_URL` / `KV_REST_API_TOKEN`) to persist the cache
across serverless instances and cold starts — cache hits consume zero
upstream quota. Without Redis, the cache falls back to per-instance
memory + local disk. When every provider is rate-limited, a cached result
is served (marked degraded) instead of failing.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
