import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  loadProfile,
  loadActivity,
  saveProfile,
  saveActivity,
  clearAll,
  SAMPLE_PROFILE,
  SAMPLE_ACTIVITY,
} from "./lib/store";
import ActivityCard from "./components/ActivityCard";
import MealCard from "./components/MealCard";
import { ProfileForm, ActivityForm } from "./components/Forms";
import StravaConnect from "./components/StravaConnect";
import CoachChat from "./components/CoachChat";

const MEAL_TIMES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

function clockMealTime() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  return "dinner";
}

const STEPS = [
  { n: 1, label: "Profile" },
  { n: 2, label: "Activity" },
  { n: 3, label: "Refuel" },
];

function Stepper({ step, hasProfile, hasActivity, onGo }) {
  const reachable = (n) => n === 1 || (n === 2 && hasProfile) || (n === 3 && hasProfile && hasActivity);
  return (
    <div className="stepper">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <button
            className={`step ${step === s.n ? "step--active" : ""} ${reachable(s.n) ? "" : "step--locked"}`}
            onClick={() => reachable(s.n) && onGo(s.n)}
            disabled={!reachable(s.n)}
          >
            <span className="step__num">{s.n}</span>
            <span className="step__label">{s.label}</span>
          </button>
          {i < STEPS.length - 1 && <span className="step__sep" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function App() {
  const [profile, setProfileState] = useState(() => loadProfile());
  const [activity, setActivityState] = useState(() => loadActivity());
  const [step, setStep] = useState(() => {
    const p = loadProfile();
    const a = loadActivity();
    return p ? (a ? 3 : 2) : 1;
  });

  const [meals, setMeals] = useState([]);
  const [mealSource, setMealSource] = useState(null);
  const [mealTime, setMealTime] = useState(clockMealTime());
  const [category, setCategory] = useState("meal");
  const [mealsLoading, setMealsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [banner, setBanner] = useState(null);
  const [mealsFlash, setMealsFlash] = useState(false);

  const mealsSectionRef = useRef(null);
  const flashTimer = useRef(null);

  // Persisting setters (localStorage = per-visitor state).
  const setProfile = (p) => { saveProfile(p); setProfileState(p); };
  const setActivity = (a) => { saveActivity(a); setActivityState(a); };

  const loadMeals = useCallback(async (mt, cat, prof, act) => {
    if (!prof || !act) return;
    setMealsLoading(true);
    setError(null);
    try {
      const res = await api.getMeals(prof, act, mt, cat);
      setMeals(res.meals || []);
      setMealSource(res.source);
    } catch (err) {
      setError(err.message);
      setMeals([]);
    } finally {
      setMealsLoading(false);
    }
  }, []);

  // Mount: Strava status, OAuth return handling, and initial meal load.
  useEffect(() => {
    (async () => {
      api.getStravaStatus().then(setStravaStatus).catch(() => {});

      const params = new URLSearchParams(window.location.search);
      const sres = params.get("strava");
      if (sres) {
        window.history.replaceState({}, "", window.location.pathname);
        if (sres === "connected") {
          const p = loadProfile();
          try {
            const r = await api.syncStrava(p);
            if (r.activity) {
              setActivity(r.activity);
              setStep(3);
              setBanner("✅ Strava connected — synced your latest run.");
              loadMeals(mealTime, category, p, r.activity);
              return;
            }
          } catch (e) {
            setBanner("Strava connected, but no recent activity to sync.");
          }
        } else if (sres === "denied") {
          setBanner("Strava connection was cancelled — you can enter activity manually.");
        } else {
          setBanner("Something went wrong connecting to Strava.");
        }
      }

      const p = loadProfile();
      const a = loadActivity();
      if (p && a) loadMeals(mealTime, category, p, a);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function onProfileSaved(p) {
    setProfile(p);
    setBanner(null);
    setStep(2);
  }

  // Used by both manual entry and Strava sync in Step 2.
  function onActivitySet(a) {
    setActivity(a);
    setBanner(null);
    setStep(3);
    loadMeals(mealTime, category, profile, a);
  }

  function onMealTimeChange(mt) {
    setMealTime(mt);
    loadMeals(mt, category, profile, activity);
  }
  function onCategoryChange(cat) {
    setCategory(cat);
    loadMeals(mealTime, cat, profile, activity);
  }

  // Coach updated the meals: swap, scroll up to the cards, flash them.
  function onCoachMeals(newMeals) {
    setMeals(newMeals);
    if (mealsSectionRef.current) {
      mealsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMealsFlash(false);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    requestAnimationFrame(() => {
      setMealsFlash(true);
      flashTimer.current = setTimeout(() => setMealsFlash(false), 1600);
    });
  }

  function trySample() {
    setProfile(SAMPLE_PROFILE);
    setActivity(SAMPLE_ACTIVITY);
    setBanner("Loaded sample data — explore, or hit “Start over” to enter your own.");
    setStep(3);
    loadMeals(mealTime, category, SAMPLE_PROFILE, SAMPLE_ACTIVITY);
  }

  function startOver() {
    clearAll();
    setProfileState(null);
    setActivityState(null);
    setMeals([]);
    setMealSource(null);
    setBanner(null);
    setStep(1);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo__mark">🏃</span>
          <div>
            <h1>Run &amp; Refuel</h1>
            <p className="tagline">Fuel today's run, the Indian way.</p>
          </div>
        </div>
      </header>

      <Stepper
        step={step}
        hasProfile={!!profile}
        hasActivity={!!activity}
        onGo={setStep}
      />

      {banner && <div className="banner">{banner}</div>}

      {/* STEP 1 — Profile */}
      {step === 1 && (
        <section>
          <h2 className="section-title">Step 1 · Set up your profile</h2>
          <p className="section-sub">Your goal and preferences shape every suggestion.</p>
          <div className="card">
            <ProfileForm profile={profile} onSaved={onProfileSaved} submitLabel="Save & continue →" />
          </div>
          <div className="or-divider"><span>or</span></div>
          <button className="btn-secondary" onClick={trySample}>
            ⚡ Try with sample data (see it instantly)
          </button>
        </section>
      )}

      {/* STEP 2 — Activity */}
      {step === 2 && (
        <section>
          <h2 className="section-title">Step 2 · Add today's activity</h2>
          <p className="section-sub">Connect Strava to pull your latest run, or enter it manually.</p>

          <StravaConnect
            status={stravaStatus}
            profile={profile}
            onSynced={onActivitySet}
            onStatusChange={setStravaStatus}
          />

          <div className="or-divider"><span>or enter manually</span></div>

          <div className="card">
            <ActivityForm
              profile={profile}
              onLogged={onActivitySet}
              submitLabel="Use this activity & continue →"
            />
          </div>

          <button className="link-btn" onClick={() => setStep(1)}>← Back to profile</button>
        </section>
      )}

      {/* STEP 3 — Refuel */}
      {step === 3 && (
        <section>
          {activity && <ActivityCard activity={activity} />}

          <div className="step3-actions">
            <button className="chip-btn" onClick={() => setStep(2)}>↺ Change activity</button>
            <button className="chip-btn" onClick={() => setStep(1)}>⚙ Edit profile</button>
            <button className="chip-btn chip-btn--warn" onClick={startOver}>Start over</button>
          </div>

          <section
            className={`meals-section ${mealsFlash ? "meals-section--flash" : ""}`}
            ref={mealsSectionRef}
          >
            <div className="meals-header">
              <h2 className="section-title">Step 3 · Refuel suggestions</h2>
              <div className="category-tabs">
                <button
                  className={`category-tab ${category === "meal" ? "is-active" : ""}`}
                  onClick={() => onCategoryChange("meal")}
                >
                  🍛 Full meals
                </button>
                <button
                  className={`category-tab ${category === "snack" ? "is-active" : ""}`}
                  onClick={() => onCategoryChange("snack")}
                >
                  🥗 Quick snacks
                </button>
              </div>
              {category === "meal" && (
                <div className="mealtime-tabs">
                  {MEAL_TIMES.map((mt) => (
                    <button
                      key={mt.value}
                      className={`mealtime-tab ${mealTime === mt.value ? "is-active" : ""}`}
                      onClick={() => onMealTimeChange(mt.value)}
                    >
                      {mt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {mealSource && mealSource !== "api" && (
              <p className="source-note">
                Showing sample {category === "snack" ? "snacks" : "meals"} (meal API unavailable).
              </p>
            )}
            {error && <p className="error-note">{error}</p>}

            {mealsLoading ? (
              <div className="card loading">Cooking up ideas…</div>
            ) : meals.length === 0 ? (
              <div className="card empty-state">No suggestions yet.</div>
            ) : (
              <div className="meal-list">
                {meals.map((m, i) => (
                  <MealCard key={i} meal={m} />
                ))}
              </div>
            )}
          </section>

          {meals.length > 0 && !mealsLoading && (
            <CoachChat
              meals={meals}
              profile={profile}
              activity={activity}
              onMealsUpdated={onCoachMeals}
            />
          )}
        </section>
      )}

      <footer className="app-footer">Run &amp; Refuel · hackathon build</footer>
    </div>
  );
}
