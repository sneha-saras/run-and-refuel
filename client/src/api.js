// Thin API client. All calls go to /api/* (same origin — proxied to Express in
// dev, served by the same deployment in production). Profile + activity live in
// the browser (see lib/store.js) and are sent to the stateless backend.

async function req(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Compute an activity summary (MET calories, intensity) without storing it.
  activitySummary: (input, profile, previousDate) =>
    req("/api/activity/summary", {
      method: "POST",
      body: JSON.stringify({ input, profile, previousDate }),
    }),
  // Turn a spoken sentence ("I just ran 5k") into an activity summary.
  parseActivity: (text, profile) =>
    req("/api/activity/parse", {
      method: "POST",
      body: JSON.stringify({ text, profile }),
    }),
  // Meal suggestions — profile + activity supplied by the client.
  getMeals: (profile, activity, mealTime, category = "meal") =>
    req("/api/meals", {
      method: "POST",
      body: JSON.stringify({ profile, activity, mealTime, category }),
    }),
  coach: (messages, meals, profile, activity) =>
    req("/api/coach", {
      method: "POST",
      body: JSON.stringify({ messages, meals, profile, activity }),
    }),
  getStravaStatus: () => req("/api/strava/status"),
  syncStrava: (profile) =>
    req("/api/strava/sync", { method: "POST", body: JSON.stringify({ profile }) }),
  disconnectStrava: () => req("/api/strava/disconnect", { method: "POST" }),
};
