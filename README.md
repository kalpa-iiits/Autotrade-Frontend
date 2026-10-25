# AutoTrade web

React + TypeScript (Vite) frontend for the AutoTrade backend (`../autotrade_backend`). It talks
only to the backend's `/api` (REST + WebSockets); strategy logic, limits and mode stay in backend
code.

Every user has their own broker accounts (paper, Fyers, Zerodha), added on the **Accounts** page
with their own broker app's credentials. The account picker in the top bar chooses which account
the Dashboard, Orders, Market and Strategies pages work on; Trades can show one account or all.

## Run

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api and /auth to http://localhost:8000
```

Start the backend first (`uvicorn app.main:app` in `../autotrade_backend`) and sign in with a
backend user (`python -m app.auth.users create <name>`, or **Create a user** on the login page if
the backend has `AUTOTRADE_ALLOW_SIGNUP=true`). Then add a broker account on the Accounts page.

The dev server proxies `/api` (with WebSockets) and `/auth` (broker callbacks) to the backend,
so the browser sees one origin and the `SameSite=Lax` session cookie just works. To point at a
backend on another port:

```bash
AUTOTRADE_API_URL=http://localhost:8010 npm run dev
```

For broker logins to come back to this app, set in the backend's `.env`:

```
AUTOTRADE_FRONTEND_URL=http://localhost:5173/accounts
```

(without it the backend shows its own "login successful" page after the broker redirect). Register
the backend's callback (`http://<backend>/auth/fyers/callback` or `/auth/zerodha/callback`) as
the redirect URL on each Fyers / Kite app; the same URL works for every account.

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
a personal API token (create one on the Settings page, or `python -m app.auth.users token <name>`):

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
| `src/auth.tsx` | `GET /api/auth/me` on load, login / sign-up / logout |
| `src/accounts.tsx` | your broker accounts, the selected one (remembered), broker-login return |
| `src/live.tsx` | the selected account's `/api/accounts/{id}/ws/orders` connection (`order_update`, `strategy_signal`, `strategy_status`) |
| `src/pages/Accounts.tsx` | add / edit / delete broker accounts (credentials write-only), daily broker login, paste token, reconnect |
| `src/pages/Dashboard.tsx` | the account's connection, funds, positions, open trades with unrealized P&L |
| `src/pages/Orders.tsx` | place market/limit, cancel, today's book (live), history |
| `src/pages/Market.tsx` | watchlist (per account) over the account's tickers socket, candle chart (lightweight-charts) |
| `src/pages/Trades.tsx` | closed trades with totals, for the selected account or all of yours |
| `src/pages/Strategies.tsx` | the account's instances: add, edit symbol/timeframe while stopped, start/stop (confirm for live), remove, signals, Stop all (all your accounts) |
| `src/pages/Settings.tsx` | personal API tokens (shown once), change password |

Orders, cancels, live-mode strategy starts and Stop all ask for confirmation first. On a Fyers or
Zerodha account they act on that real broker account.

## Testing against a throwaway backend

To try the app without touching a real account, run a copy of the backend on the paper broker
with its own database:

```bash
cd ../autotrade_backend
export AUTOTRADE_DATABASE_URL=sqlite+aiosqlite:////tmp/autotrade-test.db AUTOTRADE_LOCK_FILE=/tmp/autotrade-test.lock
python -m app.auth.users create tester
uvicorn app.main:app --port 8010
```

Then `AUTOTRADE_API_URL=http://localhost:8010 npm run dev` and add a paper account. (The test
database is separate, so it never sees your real broker accounts.)
