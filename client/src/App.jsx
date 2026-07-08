import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
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

// A collapsible section (uses native <details> for zero-dependency accordion).
function Collapsible({ title, children, defaultOpen = false }) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary className="collapsible__summary">{title}</summary>
      <div className="collapsible__body">{children}</div>
    </details>
  );
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [activity, setActivity] = useState(null);
  const [meals, setMeals] = useState([]);
  const [mealSource, setMealSource] = useState(null);
  const [mealTime, setMealTime] = useState(clockMealTime());
  const [category, setCategory] = useState("meal"); // "meal" | "snack"
  const [loading, setLoading] = useState(true);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [banner, setBanner] = useState(null);
  const [mealsFlash, setMealsFlash] = useState(false);
  const mealsSectionRef = useRef(null);
  const flashTimer = useRef(null);

  // Called when the coach updates the meals: swap them, flash the cards, and
  // bring them into view (the chat is below, so the change is otherwise unseen).
  function onCoachMeals(newMeals) {
    setMeals(newMeals);
    if (mealsSectionRef.current) {
      mealsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMealsFlash(false);
    // Restart the animation cleanly even on rapid successive updates.
    if (flashTimer.current) clearTimeout(flashTimer.current);
    requestAnimationFrame(() => {
      setMealsFlash(true);
      flashTimer.current = setTimeout(() => setMealsFlash(false), 1600);
    });
  }

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const loadMeals = useCallback(async (mt, cat = "meal") => {
    setMealsLoading(true);
    setError(null);
    try {
      const res = await api.getMeals(mt, cat);
      setMeals(res.meals || []);
      setMealSource(res.source);
    } catch (err) {
      setError(err.message);
      setMeals([]);
    } finally {
      setMealsLoading(false);
    }
  }, []);

  // Handle the return trip from Strava OAuth (?strava=connected|denied|error).
  async function handleStravaReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("strava");
    if (!result) return null;
    // Clean the URL so a refresh doesn't re-trigger.
    window.history.replaceState({}, "", window.location.pathname);
    if (result === "connected") {
      try {
        const res = await api.syncStrava();
        setActivity(res.activity);
        setBanner("✅ Strava connected — synced your latest activity.");
        return res.activity;
      } catch (err) {
        setBanner("Strava connected, but no recent activity to sync yet.");
      }
    } else if (result === "denied") {
      setBanner("Strava connection was cancelled.");
    } else if (result === "error") {
      setBanner("Something went wrong connecting to Strava.");
    }
    return null;
  }

  // Initial load: profile + latest activity + strava status, then meals.
  useEffect(() => {
    (async () => {
      try {
        const [p, a, s] = await Promise.all([
          api.getProfile(),
          api.getLatestActivity(),
          api.getStravaStatus().catch(() => null),
        ]);
        setProfile(p.profile);
        setStravaStatus(s);

        const synced = await handleStravaReturn();
        const currentActivity = synced || a.activity;
        setActivity(currentActivity);

        if (p.profile && currentActivity) await loadMeals(mealTime, category);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onActivityLogged(newActivity) {
    setActivity(newActivity);
    setBanner(null);
    loadMeals(mealTime, category);
  }

  function onMealTimeChange(mt) {
    setMealTime(mt);
    if (profile && activity) loadMeals(mt, category);
  }

  function onCategoryChange(cat) {
    setCategory(cat);
    if (profile && activity) loadMeals(mealTime, cat);
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading…</div>
      </div>
    );
  }

  const needsProfile = !profile;

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

      {banner && <div className="banner">{banner}</div>}

      {needsProfile ? (
        <section className="onboarding">
          <h2 className="section-title">Let's set up your goal</h2>
          <p className="section-sub">
            Tell us your goal and preferences so meals match you.
          </p>
          <div className="card">
            <ProfileForm profile={profile} onSaved={setProfile} />
          </div>
          <StravaConnect
            status={stravaStatus}
            onSynced={onActivityLogged}
            onStatusChange={setStravaStatus}
          />
          <div className="card">
            <h3 className="card-title">Or log today's activity manually</h3>
            <ActivityForm onLogged={onActivityLogged} />
          </div>
        </section>
      ) : (
        <>
          {activity ? (
            <ActivityCard activity={activity} />
          ) : (
            <div className="card empty-state">
              <p>No activity logged yet. Add today's run below to get meal ideas.</p>
            </div>
          )}

          <section
            className={`meals-section ${mealsFlash ? "meals-section--flash" : ""}`}
            ref={mealsSectionRef}
          >
            <div className="meals-header">
              <h2 className="section-title">Refuel suggestions</h2>

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
                      className={`mealtime-tab ${
                        mealTime === mt.value ? "is-active" : ""
                      }`}
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
                Showing sample {category === "snack" ? "snacks" : "meals"} (no API key set){" "}
                {mealSource === "mock_fallback" ? "— API unavailable" : ""}.
              </p>
            )}

            {error && <p className="error-note">{error}</p>}

            {mealsLoading ? (
              <div className="card loading">Cooking up ideas…</div>
            ) : !activity ? null : meals.length === 0 ? (
              <div className="card empty-state">No suggestions yet.</div>
            ) : (
              <div className="meal-list">
                {meals.map((m, i) => (
                  <MealCard key={i} meal={m} />
                ))}
              </div>
            )}
          </section>

          {activity && meals.length > 0 && !mealsLoading && (
            <CoachChat meals={meals} onMealsUpdated={onCoachMeals} />
          )}

          <StravaConnect
            status={stravaStatus}
            onSynced={onActivityLogged}
            onStatusChange={setStravaStatus}
          />

          <Collapsible title="🏃 Log / update today's activity (manual)">
            <ActivityForm onLogged={onActivityLogged} />
          </Collapsible>

          <Collapsible title="⚙️ Edit your profile">
            <ProfileForm profile={profile} onSaved={setProfile} />
          </Collapsible>
        </>
      )}

      <footer className="app-footer">Run &amp; Refuel · hackathon build</footer>
    </div>
  );
}
