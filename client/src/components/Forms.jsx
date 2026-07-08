import React, { useState } from "react";
import { api } from "../api";

export const GOALS = [
  { value: "lose_weight", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "fuel_training", label: "Fuel training" },
];
const DIETS = [
  { value: "veg", label: "Veg" },
  { value: "egg", label: "Egg" },
  { value: "non_veg", label: "Non-veg" },
];
const CUISINES = [
  { value: "north", label: "North Indian" },
  { value: "south", label: "South Indian" },
  { value: "both", label: "Both" },
];
const EFFORTS = [
  { value: "10", label: "10 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30+ min" },
];
const ACTIVITY_TYPES = [
  { value: "run", label: "Run" },
  { value: "walk", label: "Walk" },
  { value: "cycle", label: "Cycle" },
  { value: "swim", label: "Swim" },
  { value: "gym", label: "Gym / Strength" },
  { value: "hiit", label: "HIIT" },
  { value: "yoga", label: "Yoga / Pilates" },
  { value: "sports", label: "Sports" },
  { value: "rest", label: "Rest day" },
];
// Types where a distance makes sense; others are duration-driven.
const DISTANCE_TYPES = ["run", "walk", "cycle", "swim"];
const FEELS = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
];

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// Segmented pill selector — nicer than a dropdown on mobile.
function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`segmented__opt ${value === o.value ? "is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Dropdown — better than pills when there are many options (activity types).
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ProfileForm({ profile, onSaved, submitLabel = "Save profile" }) {
  const [goal, setGoal] = useState(profile?.goal || "maintain");
  const [diet, setDiet] = useState(profile?.diet || "veg");
  const [cuisine, setCuisine] = useState(profile?.cuisine || "both");
  const [effort, setEffort] = useState(profile?.effort || "20");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);

  function submit(e) {
    e.preventDefault();
    // Profile is client-side state (localStorage) — no server round-trip.
    onSaved({
      goal,
      diet,
      cuisine,
      effort,
      weightKg: Number(weightKg) > 0 ? Number(weightKg) : 70,
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Goal">
        <Segmented value={goal} onChange={setGoal} options={GOALS} />
      </Field>
      <Field label="Diet">
        <Segmented value={diet} onChange={setDiet} options={DIETS} />
      </Field>
      <Field label="Cuisine comfort">
        <Segmented value={cuisine} onChange={setCuisine} options={CUISINES} />
      </Field>
      <Field label="Cooking effort tolerance">
        <Segmented value={effort} onChange={setEffort} options={EFFORTS} />
      </Field>
      <Field label="Body weight (kg)">
        <input
          type="number"
          min="30"
          max="200"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </Field>
      <button className="btn-primary" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

export function ActivityForm({ profile, onLogged, submitLabel = "Log activity" }) {
  const [type, setType] = useState("run");
  const [distanceKm, setDistanceKm] = useState(5);
  const [durationMin, setDurationMin] = useState(30);
  const [feel, setFeel] = useState("moderate");
  const [saving, setSaving] = useState(false);
  const isRest = type === "rest";
  const showDistance = DISTANCE_TYPES.includes(type);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send distance for distance-based types.
      const input = {
        type,
        durationMin,
        feel,
        ...(showDistance ? { distanceKm } : {}),
      };
      const res = await api.activitySummary(input, profile);
      onLogged(res.activity);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Activity type">
        <Select value={type} onChange={setType} options={ACTIVITY_TYPES} />
      </Field>
      {!isRest && (
        <>
          <div className="field-row">
            {showDistance && (
              <Field label="Distance (km)">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </Field>
            )}
            <Field label="Duration (min)">
              <input
                type="number"
                min="0"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </Field>
          </div>
          <Field label="How did it feel?">
            <Segmented value={feel} onChange={setFeel} options={FEELS} />
          </Field>
        </>
      )}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? "Logging…" : submitLabel}
      </button>
    </form>
  );
}
