import React, { useState } from "react";
import { QUICK_COMMERCE, ingredientsToText } from "../lib/links";

// --- Per-ingredient view (kept as a fallback) ---
function IngredientRow({ ingredient }) {
  const { item, quantity } = ingredient;
  return (
    <li className="ingredient">
      <div className="ingredient__name">
        <span className="ingredient__item">{item}</span>
        {quantity && <span className="ingredient__qty">{quantity}</span>}
      </div>
      <div className="ingredient__buy">
        {QUICK_COMMERCE.map((store) => (
          <a
            key={store.key}
            className="buy-btn"
            style={{ background: store.color, color: store.textColor || "#fff" }}
            href={store.url(item)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {store.label}
          </a>
        ))}
      </div>
    </li>
  );
}

// --- Grouped-by-store view (default) ---
function StoreGroup({ store, ingredients }) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    const text = ingredientsToText(ingredients);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        },
        () => {}
      );
    }
  }

  return (
    <div className="store-group">
      <div className="store-group__head">
        <a
          className="store-order-btn"
          style={{ background: store.color, color: store.textColor || "#fff" }}
          href={store.home}
          target="_blank"
          rel="noopener noreferrer"
        >
          Order on {store.label}
        </a>
        <button className="copy-btn" type="button" onClick={copyAll}>
          {copied ? "Copied ✓" : "Copy all"}
        </button>
      </div>
      <div className="store-group__items">
        {ingredients.map((ing, i) => (
          <a
            key={i}
            className="ing-chip"
            href={store.url(ing.item)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Search "${ing.item}" on ${store.label}`}
          >
            {ing.item}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function MealCard({ meal }) {
  const [open, setOpen] = useState(false);
  const [byStore, setByStore] = useState(true); // grouped view is the default
  const {
    dish_name,
    why_this_today,
    calories,
    protein_grams,
    effort_minutes,
    ingredients = [],
  } = meal;

  return (
    <article className="meal-card">
      <h3 className="meal-card__name">{dish_name}</h3>
      {why_this_today && <p className="meal-card__why">{why_this_today}</p>}

      <div className="meal-card__badges">
        <span className="mbadge mbadge--cal">🔥 {calories} kcal</span>
        <span className="mbadge mbadge--protein">💪 {protein_grams}g protein</span>
        <span className="mbadge mbadge--effort">⏱ {effort_minutes} min</span>
      </div>

      <button
        className="meal-card__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide ingredients" : `Show ingredients (${ingredients.length})`}
        <span className={`chevron ${open ? "chevron--up" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="ingredients-panel">
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle__opt ${byStore ? "is-active" : ""}`}
              onClick={() => setByStore(true)}
            >
              By store
            </button>
            <button
              type="button"
              className={`view-toggle__opt ${!byStore ? "is-active" : ""}`}
              onClick={() => setByStore(false)}
            >
              By ingredient
            </button>
          </div>

          {byStore ? (
            <div className="store-groups">
              {QUICK_COMMERCE.map((store) => (
                <StoreGroup key={store.key} store={store} ingredients={ingredients} />
              ))}
            </div>
          ) : (
            <ul className="ingredient-list">
              {ingredients.map((ing, i) => (
                <IngredientRow key={i} ingredient={ing} />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
