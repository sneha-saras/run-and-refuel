import React from "react";

const TYPE_LABELS = {
  run: "Run",
  walk: "Walk",
  cycle: "Cycle",
  swim: "Swim",
  gym: "Strength",
  hiit: "HIIT",
  yoga: "Yoga",
  sports: "Sports",
  rest: "Rest day",
};

// Intensity -> badge color class (see styles.css .badge--*)
const INTENSITY_CLASS = {
  Rest: "badge--rest",
  Easy: "badge--easy",
  Moderate: "badge--moderate",
  Hard: "badge--hard",
};

export default function ActivityCard({ activity }) {
  if (!activity) return null;
  const {
    type,
    distanceKm,
    durationMin,
    calories,
    intensity,
    daysSinceLastActivity,
    source,
  } = activity;
  const isRest = type === "rest";

  return (
    <section className="activity-card">
      <div className="activity-card__top">
        <div>
          <p className="activity-card__eyebrow">Today's activity</p>
          <h2 className="activity-card__title">
            {TYPE_LABELS[type] || type}
            {source === "strava" && <span className="strava-chip">via Strava</span>}
          </h2>
        </div>
        <span className={`badge ${INTENSITY_CLASS[intensity] || "badge--moderate"}`}>
          {intensity}
        </span>
      </div>

      <div className="activity-card__stats">
        {!isRest && (
          <>
            {distanceKm > 0 && (
              <div className="astat">
                <span className="astat__value">{distanceKm}</span>
                <span className="astat__unit">km</span>
              </div>
            )}
            <div className="astat">
              <span className="astat__value">{durationMin}</span>
              <span className="astat__unit">min</span>
            </div>
          </>
        )}
        <div className="astat astat--calories">
          <span className="astat__value">{calories}</span>
          <span className="astat__unit">kcal burned</span>
        </div>
      </div>

      <p className="activity-card__meta">
        {daysSinceLastActivity == null
          ? "First logged activity"
          : daysSinceLastActivity === 0
          ? "Also active earlier today"
          : `${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? "" : "s"} since your last activity`}
      </p>
    </section>
  );
}
