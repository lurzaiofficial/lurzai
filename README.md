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
- Express server (`server.ts`)
- Tailwind CSS
- OpenRouter for AI analysis
- Public crypto market data (Binance and other exchanges)
- Twelve Data for non-crypto markets (optional)

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

Never commit a real `.env` file. Keep secrets out of version control.

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
