# AutoTrade web

React + TypeScript (Vite) frontend for the AutoTrade backend (`../autotrade`). It talks only to
the backend's `/api` (REST + WebSockets); strategy logic, limits and mode stay in backend code.

## Run

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api and /auth to http://localhost:8000
```

Start the backend first (`uvicorn app.main:app` in `../autotrade`) and sign in with a backend
user (`python -m app.auth.users create <name>`).

The dev server proxies `/api` (with WebSockets) and `/auth` (broker callbacks) to the backend,
so the browser sees one origin and the `SameSite=Lax` session cookie just works. To point at a
backend on another port:

```bash
AUTOTRADE_API_URL=http://localhost:8010 npm run dev
```

For broker logins to come back to this app, set in the backend's `.env`:

```
AUTOTRADE_FRONTEND_URL=http://localhost:5173/settings
```

(without it the backend shows its own "login successful" page after the broker redirect).

## Build

```bash
npm run build        # type-check + production bundle in dist/
npm run lint
```

`dist/` is static. Serve it behind the same host as the backend (reverse-proxy `/api` and
`/auth` to it), or on another origin with `AUTOTRADE_CORS_ORIGINS` set on the backend — the
client calls relative `/api/...` URLs, so a same-origin proxy is the simplest.

## API types

`src/api/schema.d.ts` is generated from the backend's OpenAPI schema with `openapi-typescript`
and used through `openapi-fetch` (`src/api/client.ts`). The schema needs a signed-in session or
the backend's API token (`AUTOTRADE_API_TOKEN`):

```bash
AUTOTRADE_API_TOKEN=... npm run gen:api
AUTOTRADE_API_URL=http://localhost:8010 AUTOTRADE_API_TOKEN=... npm run gen:api
```

Many backend endpoints return plain dicts that the schema leaves untyped; their shapes are
hand-written in `src/api/types.ts`. Update them there if the backend changes.

## What's where

| | |
|---|---|
| `src/api/client.ts` | typed fetch client, `ApiError`, any 401 → login page |
| `src/api/socket.ts` | WebSocket with reconnect + backoff; close 1008 (or a rejected handshake + 401) → login |
| `src/auth.tsx` | `GET /api/auth/me` on load, login / logout |
| `src/live.tsx` | the single `/api/ws/orders` connection (`order_update`, `strategy_signal`, `strategy_status`) |
| `src/pages/Dashboard.tsx` | broker status, funds, positions, open trades with unrealized P&L |
| `src/pages/Orders.tsx` | place market/limit, cancel, today's book (live), history |
| `src/pages/Market.tsx` | watchlist over `/api/ws/tickers`, candle chart (lightweight-charts) |
| `src/pages/Trades.tsx` | closed trades with totals |
| `src/pages/Strategies.tsx` | instances: add, edit symbol/timeframe while stopped, start/stop (confirm for live), remove, signals, Stop all |
| `src/pages/Settings.tsx` | broker login (Fyers/Zerodha) and return, change password |

Orders, cancels, live-mode strategy starts and Stop all ask for confirmation first. With a real
broker connected (`AUTOTRADE_BROKER=fyers|zerodha`) they act on the real account.

## Testing against a throwaway backend

To try the app without touching a real account, run a copy of the backend on the paper broker
with its own database:

```bash
cd ../autotrade
export AUTOTRADE_BROKER=paper AUTOTRADE_DATABASE_URL=sqlite+aiosqlite:////tmp/autotrade-test.db
python -m app.auth.users create tester
uvicorn app.main:app --port 8010
```

Environment variables override `.env`, but `.env` still supplies anything not overridden (e.g.
broker keys); copying the backend without its `.env` avoids that. Then
`AUTOTRADE_API_URL=http://localhost:8010 npm run dev`.
