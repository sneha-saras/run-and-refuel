# Run & Refuel 🏃

Takes your running activity + fitness goal and suggests Indian home-cooked meals matched to today's effort, with each ingredient deep-linked to quick-commerce apps (Zepto / Blinkit / Instamart).

**Stack:** Node.js + Express (backend) · React + Vite (frontend) · single JSON file for storage (no DB).

---

## Prerequisites

- **Node.js 20+** (tested on 24). If you use `nvm`: `nvm install --lts && nvm use --lts`.

## Setup

```bash
npm run install:all          # installs root + client deps
cp .env.example .env         # then fill in values (see below)
```

## Run — development (two dev servers, hot reload)

```bash
npm start
```

- Frontend: **http://localhost:5173** (open this)
- Backend API: http://localhost:3000 (Vite proxies `/api` → here)
- Stop with **Ctrl+C** (cleanly kills both). If a port gets stuck: `lsof -ti tcp:3000 tcp:5173 | xargs kill -9`.

## Run — production (single process)

Express builds nothing at runtime — you build the frontend once, then Express serves it **and** the API on one port:

```bash
npm run build                # builds client into client/dist
npm run serve                # NODE_ENV=production, serves dist + /api on $PORT
```

Open **http://localhost:3000** (or whatever `PORT` you set). This is the shape to deploy on a server.

## Run — Docker (optional)

A `Dockerfile` is included (single-process image). Requires Docker installed:

```bash
docker build -t run-refuel .
docker run -p 3000:3000 --env-file .env run-refuel
```

---

## Environment variables

| Var | Purpose |
|---|---|
| `PORT` | Port for the production server (default 3000) |
| `OPENAI_BASE_URL` | LLM gateway base URL (e.g. `https://.../v1`). **Empty → mock mode** |
| `OPENAI_API_KEY` | Gateway key. Sent as `x-bf-vk` (Bifrost) **and** `Authorization: Bearer` |
| `MODEL_NAME` | Model id (e.g. `gpt-4o`) |
| `GATEWAY_PROXY` | Optional HTTP(S) proxy so the backend egresses from an allowlisted IP |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | From https://www.strava.com/settings/api (callback domain: your host) |
| `STRAVA_REDIRECT_URI` / `CLIENT_URL` | Deploy-only overrides for the OAuth callback + post-login redirect |

### Mock mode
If `OPENAI_API_KEY` is empty (or the gateway is unreachable), meal suggestions fall back to a realistic hardcoded set. The app is fully usable without the LLM — only the meal *text* is canned.

### ⚠️ Gateway network note (buildathon)
The `gateway-buildathon.ltl.sh` gateway is behind Akamai and **allowlists a corporate egress IP**. Calls from a normal home/ISP connection get `403 Access Denied`, and the browser can't call it directly (CORS-blocked). To get **real** meal generation, run the backend on a host that's on the allowlisted network (e.g. a Meesho server), or set `GATEWAY_PROXY` to a corporate proxy. The code is already correct — it only needs an allowlisted egress.

---

## Data storage

All state lives in `server/data.json` (git-ignored): your profile, activity log, and Strava tokens. Delete it to reset.

## Features by area

- **Onboarding** — goal, diet, cuisine, cooking-effort tolerance, body weight (for calorie math).
- **Activity** — manual entry (run/walk/rest) **or** Strava sync; MET-based calorie estimate + intensity badge + days-since-last.
- **Meals** — 3 suggestions matched to today's activity + meal time, each with a "why this today" line, macros, and quick-commerce ingredient links.
- **Strava** — OAuth2 connect, 7-day fetch, latest activity mapped into the same summary format; manual entry remains as a fallback.
