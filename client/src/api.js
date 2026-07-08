// Thin API client. All calls go to /api/* (proxied to the Express server in dev).

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
  getProfile: () => req("/api/profile"),
  saveProfile: (profile) =>
    req("/api/profile", { method: "POST", body: JSON.stringify(profile) }),
  addActivity: (activity) =>
    req("/api/activity", { method: "POST", body: JSON.stringify(activity) }),
  getLatestActivity: () => req("/api/activity/latest"),
  getMeals: (mealTime, category = "meal") => {
    const params = new URLSearchParams();
    if (mealTime) params.set("mealTime", mealTime);
    if (category) params.set("category", category);
    const qs = params.toString();
    return req(`/api/meals${qs ? `?${qs}` : ""}`);
  },
  coach: (messages, meals) =>
    req("/api/coach", { method: "POST", body: JSON.stringify({ messages, meals }) }),
  getStravaStatus: () => req("/api/strava/status"),
  syncStrava: () => req("/api/strava/sync", { method: "POST" }),
  disconnectStrava: () => req("/api/strava/disconnect", { method: "POST" }),
};
