// Per-visitor state lives in the browser (localStorage), so every judge who
// opens the link gets their own isolated, consistent flow. The backend is
// stateless for meals/coach — the client sends profile + activity each call.

const PROFILE_KEY = "rr_profile";
const ACTIVITY_KEY = "rr_activity";
const STRAVA_KEY = "rr_strava_connected";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}

export const loadProfile = () => read(PROFILE_KEY);
export const loadActivity = () => read(ACTIVITY_KEY);

export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
export function saveActivity(a) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(a));
}
export function clearAll() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  localStorage.removeItem(STRAVA_KEY);
}

// Strava "connected" is scoped to THIS browser — a visitor is only "connected"
// if they themselves completed OAuth here, regardless of shared server tokens.
export const loadStravaConnected = () => localStorage.getItem(STRAVA_KEY) === "1";
export function setStravaConnected(v) {
  if (v) localStorage.setItem(STRAVA_KEY, "1");
  else localStorage.removeItem(STRAVA_KEY);
}

// One-click demo so a judge can see the full experience instantly.
export const SAMPLE_PROFILE = {
  goal: "fuel_training",
  diet: "veg",
  cuisine: "both",
  effort: "20",
  weightKg: 68,
};
export const SAMPLE_ACTIVITY = {
  type: "run",
  feel: "hard",
  distanceKm: 10,
  durationMin: 52,
  calories: 724,
  intensity: "Hard",
  daysSinceLastActivity: 1,
  date: "2026-07-08T01:30:00.000Z",
  source: "sample",
};
