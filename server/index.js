require("dotenv").config();
const express = require("express");
const path = require("path");

const storage = require("./storage");
const { buildActivitySummary } = require("./activity");
const { getMealTime, suggestMeals, coachReply } = require("./meals");
const strava = require("./strava");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- API routes ---

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Profile (onboarding)
app.get("/api/profile", (req, res) => {
  res.json({ profile: storage.getProfile() });
});

app.post("/api/profile", (req, res) => {
  const { goal, diet, cuisine, effort, weightKg } = req.body || {};
  if (!goal || !diet || !cuisine || !effort) {
    return res.status(400).json({ error: "Missing required profile fields." });
  }
  const profile = {
    goal,
    diet,
    cuisine,
    effort,
    weightKg: Number(weightKg) > 0 ? Number(weightKg) : null,
  };
  storage.saveProfile(profile);
  res.json({ profile });
});

// Manual activity entry -> builds + stores a summary, returns it. (Legacy,
// server-stored path — kept for backward compatibility.)
app.post("/api/activity", (req, res) => {
  const profile = storage.getProfile();
  const existingLog = storage.getActivityLog();
  const summary = buildActivitySummary(req.body || {}, profile, existingLog);
  storage.addActivity(summary);
  res.json({ activity: summary });
});

// Stateless activity summary: compute from raw input + profile WITHOUT storing.
// Body: { input: {type,distanceKm,durationMin,feel}, profile, previousDate? }
// The client keeps the result in its own localStorage (per-visitor state).
app.post("/api/activity/summary", (req, res) => {
  const { input, profile, previousDate } = req.body || {};
  const prior = previousDate ? [{ date: previousDate }] : [];
  const summary = buildActivitySummary(input || {}, profile || null, prior);
  res.json({ activity: summary });
});

// Latest activity summary (for the top card).
app.get("/api/activity/latest", (req, res) => {
  res.json({ activity: storage.getLatestActivity() });
});

app.get("/api/activity/log", (req, res) => {
  res.json({ log: storage.getActivityLog() });
});

// Meal suggestions for the latest activity + current (or overridden) meal time.
// Optional query params: ?mealTime=breakfast|lunch|dinner  (else derived from clock)
//                        ?hour=0-23  (for testing the clock logic)
app.get("/api/meals", async (req, res) => {
  const profile = storage.getProfile();
  const activity = storage.getLatestActivity();
  if (!profile) {
    return res.status(400).json({ error: "Set up your profile first." });
  }
  if (!activity) {
    return res.status(400).json({ error: "Log an activity first." });
  }
  const mealTime =
    req.query.mealTime ||
    getMealTime(req.query.hour != null ? Number(req.query.hour) : undefined);
  const category = req.query.category === "snack" ? "snack" : "meal";
  try {
    const result = await suggestMeals(profile, activity, mealTime, category);
    res.json({ mealTime, category, ...result });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate meals." });
  }
});

// Stateless meals: profile + activity come from the client (localStorage).
// Body: { profile, activity, mealTime?, category?, hour? }
app.post("/api/meals", async (req, res) => {
  const { profile, activity, mealTime: mt, category: cat, hour } = req.body || {};
  if (!profile) return res.status(400).json({ error: "Set up your profile first." });
  if (!activity) return res.status(400).json({ error: "Add today's activity first." });
  const mealTime = mt || getMealTime(hour != null ? Number(hour) : undefined);
  const category = cat === "snack" ? "snack" : "meal";
  try {
    const result = await suggestMeals(profile, activity, mealTime, category);
    res.json({ mealTime, category, ...result });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate meals." });
  }
});

// Coach chat: adjust the current meal suggestions via natural-language chat.
// Body: { messages: [{role:'user'|'assistant', content}], meals: [current meals] }
// Returns: { reply: string, meals: [...] | null }  (null meals => keep current)
app.post("/api/coach", async (req, res) => {
  const { messages, meals, profile: bodyProfile, activity: bodyActivity } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No messages provided." });
  }
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_BASE_URL) {
    return res.json({
      reply:
        "Coach needs the meal API configured (set OPENAI_API_KEY). I can't chat in mock mode.",
      meals: null,
    });
  }
  // Prefer client-provided (localStorage) profile/activity; fall back to storage.
  const profile = bodyProfile || storage.getProfile();
  const activity = bodyActivity || storage.getLatestActivity();
  try {
    const result = await coachReply(profile, activity, meals || [], messages);
    res.json(result); // { reply, meals }
  } catch (err) {
    console.error("[coach] error:", err.message);
    res.status(502).json({ error: "Coach is unavailable right now." });
  }
});

// --- Strava (Phase 4) ---

// Connection status for the UI.
app.get("/api/strava/status", (req, res) => {
  res.json(strava.getStatus());
});

// Kick off OAuth: redirect the browser to Strava's authorize page.
app.get("/api/strava/authorize", (req, res) => {
  if (!strava.isConfigured()) {
    return res
      .status(400)
      .json({ error: "Strava not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET." });
  }
  res.redirect(strava.getAuthorizeUrl(req));
});

// OAuth callback: Strava redirects here with ?code=... (or ?error=...).
app.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  const back = strava.clientUrl(req);
  if (error || !code) {
    return res.redirect(`${back}?strava=denied`);
  }
  try {
    await strava.exchangeCodeForToken(code);
    res.redirect(`${back}?strava=connected`);
  } catch (err) {
    console.error("[strava] callback error:", err.message);
    res.redirect(`${back}?strava=error`);
  }
});

// Pull the latest activity from Strava into the standard summary format.
app.post("/api/strava/sync", async (req, res) => {
  try {
    const result = await strava.syncLatestActivity((req.body || {}).profile);
    if (!result.activity) {
      return res
        .status(404)
        .json({ error: "No Strava activities found in the last 7 days." });
    }
    res.json(result);
  } catch (err) {
    console.error("[strava] sync error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// Disconnect: clear stored tokens.
app.post("/api/strava/disconnect", (req, res) => {
  strava.disconnect();
  res.json({ ok: true });
});

// --- Static serve (production single-process, e.g. local `npm run serve`) ---
// On Vercel the frontend is served by Vercel's static hosting, not Express,
// so we skip this there (VERCEL is set automatically in that environment).
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const clientDist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Start a long-running server only when NOT on Vercel (serverless invokes the
// exported app per-request instead of calling listen()).
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Run & Refuel] server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
