// Activity summary logic: converts raw activity input into a summary with
// estimated calories (MET-based), intensity, and days since last activity.

// MET (Metabolic Equivalent of Task) values by activity type + how it felt.
// Calories = MET * bodyWeightKg * durationHours
const MET_TABLE = {
  run: { easy: 8.3, moderate: 10.0, hard: 12.3 },
  walk: { easy: 2.8, moderate: 3.8, hard: 5.0 },
  rest: { easy: 0, moderate: 0, hard: 0 },
};

const DEFAULT_WEIGHT_KG = 70;

function estimateCalories({ type, feel, durationMin, weightKg }) {
  const byType = MET_TABLE[type] || MET_TABLE.run;
  const met = byType[feel] != null ? byType[feel] : byType.moderate;
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const hours = (Number(durationMin) || 0) / 60;
  return Math.round(met * weight * hours);
}

// Intensity badge. Rest days are always "Rest". Otherwise driven by how it
// felt, but a fast pace can bump an "easy"-feeling run up a notch.
function deriveIntensity({ type, feel, distanceKm, durationMin }) {
  if (type === "rest") return "Rest";

  let level = { easy: 1, moderate: 2, hard: 3 }[feel] || 2;

  // Pace check for runs: faster than 5:00/km is objectively hard effort.
  if (type === "run" && distanceKm > 0 && durationMin > 0) {
    const paceMinPerKm = durationMin / distanceKm;
    if (paceMinPerKm < 5 && level < 3) level += 1;
  }

  return { 1: "Easy", 2: "Moderate", 3: "Hard" }[level];
}

// Days since the most recent activity that happened before this one.
// `previousDates` is a list of ISO date strings from prior log entries.
function daysSinceLast(previousDates, currentDateISO) {
  if (!previousDates || previousDates.length === 0) return null;
  const current = new Date(currentDateISO);
  // Most recent prior date.
  const prior = previousDates
    .map((d) => new Date(d))
    .filter((d) => d < current)
    .sort((a, b) => b - a)[0];
  if (!prior) return null;
  const ms = current - prior;
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

// Build a full activity record from raw form input + profile + existing log.
function buildActivitySummary(input, profile, existingLog) {
  const type = ["run", "walk", "rest"].includes(input.type) ? input.type : "run";
  const feel = ["easy", "moderate", "hard"].includes(input.feel)
    ? input.feel
    : "moderate";
  const distanceKm = type === "rest" ? 0 : Number(input.distanceKm) || 0;
  const durationMin = type === "rest" ? 0 : Number(input.durationMin) || 0;
  const weightKg = profile && profile.weightKg ? profile.weightKg : DEFAULT_WEIGHT_KG;
  const date = input.date || new Date().toISOString();

  const calories = estimateCalories({ type, feel, durationMin, weightKg });
  const intensity = deriveIntensity({ type, feel, distanceKm, durationMin });
  const previousDates = (existingLog || []).map((a) => a.date);
  const daysSince = daysSinceLast(previousDates, date);

  return {
    type,
    feel,
    distanceKm,
    durationMin,
    calories,
    intensity,
    daysSinceLastActivity: daysSince,
    date,
    source: input.source || "manual", // "manual" | "strava" (Phase 4)
  };
}

module.exports = {
  MET_TABLE,
  DEFAULT_WEIGHT_KG,
  estimateCalories,
  deriveIntensity,
  daysSinceLast,
  buildActivitySummary,
};
