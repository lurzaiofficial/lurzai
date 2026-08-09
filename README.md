# LURZ AI

A live multi-market AI desk that turns price action and technical context into clear trade signals — so you can decide with confidence.

LURZ analyses crypto, stocks, forex, and commodities in one workspace. You get AI-backed verdicts, live charts, and chat context without handing over exchange credentials or letting the app place orders for you.

**Repository:** [github.com/lurzaiofficial/lurzai](https://github.com/lurzaiofficial/lurzai)

## Features

- **AI trade signals** — Clear buy / sell / stand-aside verdicts with confidence scores, grounded in technical indicators and AI interpretation
- **Multi-market coverage** — Crypto plus stocks, forex, commodities, indices, and ETFs from a single desk
- **Live charts and tracking** — Real-time price views, active signal follow-through, and signal history
- **Setup analysis chat** — Ask about the current market context and the reasoning behind a signal
- **You stay in control** — Signal advisor only; no order placement and no exchange API keys from end users

## Stack

- React 19 + Vite + TypeScript
- Express API (`server.ts` locally; Vercel serverless via `api/index.ts`)
- Supabase Auth (browser client)
- Tailwind CSS
- OpenRouter for AI analysis
- Public crypto market data (Binance and other exchanges)
- Twelve Data for non-crypto markets (optional)

## Production (Vercel)

Production domain: [https://lurzai.vercel.app](https://lurzai.vercel.app)

Set these in **Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Variable | Where used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser (Vite) |
| `VITE_SUPABASE_ANON_KEY` | Browser (Vite) |
| `OPENROUTER_API_KEY` | Server / API |
| `APP_URL` | Server (use `https://lurzai.vercel.app`) |
| `TWELVEDATA_API_KEY` | Server (optional) |
| `RESEND_API_KEY` / `RESEND_FROM` | Server (optional) |

`vercel.json` rewrites SPA routes (`/app`, `/reset-password`, …) to `index.html` and `/api/*` to the Express serverless function.

### Supabase URL Configuration (required for auth)

In Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** `https://lurzai.vercel.app`
- **Redirect URLs** (keep localhost for local dev):
  - `http://localhost:3000/**`
  - `http://localhost:3000/reset-password`
  - `http://localhost:3000/app`
  - `https://lurzai.vercel.app/**`
  - `https://lurzai.vercel.app/reset-password`
  - `https://lurzai.vercel.app/app`
  - Optional previews: `https://*-lurz-ai.vercel.app/**`

Password reset and email confirmation redirects use `window.location.origin` in the client, so they work on both localhost and Vercel once the allow list includes each origin.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- npm (bundled with Node.js)

## Getting started

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set the keys you need. See [Environment variables](#environment-variables) below.

3. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy from [`.env.example`](.env.example):

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port (default `3000`) |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` |
| `DATA_DIR` | No | JSON datastore directory (default `./.data`) |
| `OPENROUTER_API_KEY` | Yes (for signals) | Operator key for AI analysis; without it, live prices and indicators still work but signal generation is disabled |
| `APP_URL` | No | App URL sent to OpenRouter for attribution (default `http://localhost:3000`) |
| `TWELVEDATA_API_KEY` | No | Enables stocks, forex, commodities, indices, and ETFs; crypto works without it |
| `BINANCE_BASE_URL` | No | Override Binance REST host if blocked in your region |
| `VITE_SUPABASE_URL` | Yes (for auth) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes (for auth) | Supabase anon/publishable key |
| `RESEND_API_KEY` | No | Server-side Resend key for app welcome emails |
| `RESEND_FROM` | No | From address for app mail (default `LURZ AI <onboarding@resend.dev>`) |

Never commit a real `.env` file. Keep secrets out of version control.

### Resend + Vercel

1. Add `RESEND_API_KEY` (and optionally `RESEND_FROM`) in **Vercel → Project → Settings → Environment Variables** for Production and Preview. Secrets cannot be pushed via git.
2. Redeploy after adding the variable so the server process picks it up.
3. Verify a sending domain in [Resend Domains](https://resend.com/domains), then set `RESEND_FROM` to an address on that domain.

### Supabase Auth emails (forgot password / confirm signup)

Sign-in, sign-up, and forgot-password still go through **Supabase Auth**. Resend does not replace Auth unless you point Supabase at Resend SMTP:

1. Supabase Dashboard → **Authentication** → **SMTP Settings** (or Emails → SMTP)
2. Enable Custom SMTP:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587`
   - **Username:** `resend`
   - **Password:** your Resend API key (same value as `RESEND_API_KEY`)
   - **Sender email / name:** a verified Resend domain address
3. Keep Site URL and Redirect URLs aligned with your Vercel domain (and `/reset-password` for recovery).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the client and bundle the server |
| `npm start` | Run the production server from `dist/` |
| `npm test` | Run the test suite |
| `npm run lint` | Typecheck with TypeScript (`tsc --noEmit`) |
| `npm run clean` | Remove build output |
| `npm run verify:paper` | Run the paper-trading verification script |

## License

Private project. All rights reserved unless otherwise stated.
