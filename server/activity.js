// Activity summary logic: converts raw activity input into a summary with
// estimated calories (MET-based), intensity, and days since last activity.

// MET (Metabolic Equivalent of Task) values by activity type + how it felt.
// Calories = MET * bodyWeightKg * durationHours
const MET_TABLE = {
  run: { easy: 8.3, moderate: 10.0, hard: 12.3 },
  walk: { easy: 2.8, moderate: 3.8, hard: 5.0 },
  cycle: { easy: 6.0, moderate: 8.0, hard: 10.0 },
  swim: { easy: 6.0, moderate: 8.3, hard: 10.0 },
  gym: { easy: 3.5, moderate: 5.0, hard: 6.0 }, // strength training
  hiit: { easy: 6.0, moderate: 8.0, hard: 10.0 },
  yoga: { easy: 2.5, moderate: 3.0, hard: 4.0 },
  sports: { easy: 6.0, moderate: 7.5, hard: 10.0 },
  rest: { easy: 0, moderate: 0, hard: 0 },
};

const ACTIVITY_TYPES = Object.keys(MET_TABLE);

// Which types are distance-based (a distance makes sense). Others use duration.
const DISTANCE_TYPES = ["run", "walk", "cycle", "swim"];

const DEFAULT_WEIGHT_KG = 70;

function estimateCalories({ type, feel, durationMin, weightKg }) {
  const byType = MET_TABLE[type] || MET_TABLE.run;
  const met = byType[feel] != null ? byType[feel] : byType.moderate;
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const hours = (Number(durationMin) || 0) / 60;
  return Math.round(met * weight * hours);
}

// Intensity badge. Rest days are always "Rest". Otherwise driven by how it
// felt, but a fast running pace can bump an "easy"-feeling run up a notch.
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
  const type = ACTIVITY_TYPES.includes(input.type) ? input.type : "run";
  const feel = ["easy", "moderate", "hard"].includes(input.feel)
    ? input.feel
    : "moderate";
  // Distance only applies to distance-based types; others are duration-driven.
  const distanceKm =
    type === "rest" || !DISTANCE_TYPES.includes(type) ? 0 : Number(input.distanceKm) || 0;
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
  ACTIVITY_TYPES,
  DISTANCE_TYPES,
  DEFAULT_WEIGHT_KG,
  estimateCalories,
  deriveIntensity,
  daysSinceLast,
  buildActivitySummary,
};
