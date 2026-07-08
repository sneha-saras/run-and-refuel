// Strava OAuth2 + activity fetch.
// Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
// Scope: activity:read_all. Callback: http://localhost:3000/callback

const storage = require("./storage");
const { buildActivitySummary } = require("./activity");

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

function isConfigured() {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

// Derive the site's base URL (scheme://host) from the incoming request, so
// OAuth works on whatever domain the app is actually served from (localhost,
// *.vercel.app, custom domain) without relying on env vars. Honors proxy
// headers set by Vercel/hosts.
function baseUrlFromReq(req) {
  if (!req || !req.headers) return null;
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() ||
    (req.secure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return host ? `${proto}://${host}` : null;
}

// redirect_uri for the OAuth handshake. Priority: explicit env var override >
// the actual request domain > localhost dev default.
function redirectUri(req) {
  if (process.env.STRAVA_REDIRECT_URI) return process.env.STRAVA_REDIRECT_URI;
  const base = baseUrlFromReq(req);
  return base ? `${base}/callback` : "http://localhost:3000/callback";
}

// Where to send the browser after the OAuth dance finishes.
function clientUrl(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL;
  const base = baseUrlFromReq(req);
  if (base) return base;
  return process.env.NODE_ENV === "production" ? "/" : "http://localhost:5173";
}

function getAuthorizeUrl(req) {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

// Exchange an authorization code for tokens and persist them.
async function exchangeCodeForToken(code) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const tokens = {
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: data.expires_at, // epoch seconds
    athlete: data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname } : null,
  };
  const db = storage.readData();
  db.stravaTokens = tokens;
  storage.writeData(db);
  return tokens;
}

// Refresh an expired access token using the stored refresh token.
async function refreshTokens(existing) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: existing.refresh,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const tokens = {
    ...existing,
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: data.expires_at,
  };
  const db = storage.readData();
  db.stravaTokens = tokens;
  storage.writeData(db);
  return tokens;
}

// Return a valid access token, refreshing if it's expired (or within 60s of it).
async function getValidAccessToken() {
  const tokens = storage.readData().stravaTokens;
  if (!tokens || !tokens.access) throw new Error("Not connected to Strava.");
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt && tokens.expiresAt - 60 <= nowSec) {
    const refreshed = await refreshTokens(tokens);
    return refreshed.access;
  }
  return tokens.access;
}

// Fetch activities from the last `days` days (default 7).
async function fetchRecentActivities(days = 7) {
  const access = await getValidAccessToken();
  const afterSec = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const params = new URLSearchParams({ after: String(afterSec), per_page: "30" });
  const res = await fetch(`${STRAVA_API}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Activities fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

// Map a Strava activity onto the raw input shape Phase 1's summary builder expects.
function stravaTypeToLocal(stravaType) {
  const t = (stravaType || "").toLowerCase();
  if (t.includes("walk")) return "walk";
  if (t.includes("hike")) return "walk";
  return "run"; // Run, and anything else, treated as a run for our meal logic
}

// Infer "how it felt" from pace (min/km) since Strava has no felt field.
function inferFeel(type, distanceKm, durationMin) {
  if (!distanceKm || !durationMin) return "moderate";
  const pace = durationMin / distanceKm;
  if (type === "walk") return pace < 10 ? "moderate" : "easy";
  // run
  if (pace < 5) return "hard";
  if (pace < 6.5) return "moderate";
  return "easy";
}

function stravaToRawInput(act) {
  const type = stravaTypeToLocal(act.type);
  const distanceKm = act.distance ? +(act.distance / 1000).toFixed(2) : 0;
  const durationMin = act.moving_time ? Math.round(act.moving_time / 60) : 0;
  const feel = inferFeel(type, distanceKm, durationMin);
  return {
    type,
    distanceKm,
    durationMin,
    feel,
    date: act.start_date || new Date().toISOString(),
    source: "strava",
  };
}

// Sync: fetch last 7 days, map the most recent activity into the standard
// summary format, store it, and return it (plus a lightweight 7-day list).
async function syncLatestActivity(clientProfile) {
  const activities = await fetchRecentActivities(7);
  if (activities.length === 0) {
    return { activity: null, weekCount: 0 };
  }
  // Strava returns newest first, but sort defensively.
  activities.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  const latest = activities[0];

  // Prefer the client's profile (for body weight in the calorie math).
  const profile = clientProfile || storage.getProfile();
  const raw = stravaToRawInput(latest);
  const summary = buildActivitySummary(raw, profile, []);

  return {
    activity: summary,
    weekCount: activities.length,
    week: activities.map((a) => ({
      name: a.name,
      type: a.type,
      distanceKm: a.distance ? +(a.distance / 1000).toFixed(2) : 0,
      date: a.start_date,
    })),
  };
}

function getStatus() {
  const tokens = storage.readData().stravaTokens;
  return {
    configured: isConfigured(),
    connected: !!(tokens && tokens.access),
    athlete: tokens && tokens.athlete ? tokens.athlete : null,
  };
}

function disconnect() {
  const db = storage.readData();
  db.stravaTokens = null;
  storage.writeData(db);
}

module.exports = {
  isConfigured,
  clientUrl,
  getAuthorizeUrl,
  exchangeCodeForToken,
  getValidAccessToken,
  fetchRecentActivities,
  stravaToRawInput,
  inferFeel,
  syncLatestActivity,
  getStatus,
  disconnect,
};
