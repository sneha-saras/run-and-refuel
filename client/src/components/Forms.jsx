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
  { value: "rest", label: "Rest day" },
];
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

export function ProfileForm({ profile, onSaved }) {
  const [goal, setGoal] = useState(profile?.goal || "maintain");
  const [diet, setDiet] = useState(profile?.diet || "veg");
  const [cuisine, setCuisine] = useState(profile?.cuisine || "both");
  const [effort, setEffort] = useState(profile?.effort || "20");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.saveProfile({ goal, diet, cuisine, effort, weightKg });
      onSaved(res.profile);
    } finally {
      setSaving(false);
    }
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
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

export function ActivityForm({ onLogged }) {
  const [type, setType] = useState("run");
  const [distanceKm, setDistanceKm] = useState(5);
  const [durationMin, setDurationMin] = useState(30);
  const [feel, setFeel] = useState("moderate");
  const [saving, setSaving] = useState(false);
  const isRest = type === "rest";

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.addActivity({ type, distanceKm, durationMin, feel });
      onLogged(res.activity);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Activity type">
        <Segmented value={type} onChange={setType} options={ACTIVITY_TYPES} />
      </Field>
      {!isRest && (
        <>
          <div className="field-row">
            <Field label="Distance (km)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </Field>
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
        {saving ? "Logging…" : "Log activity"}
      </button>
    </form>
  );
}
