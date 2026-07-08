// Meal suggestion engine.
// Calls an OpenAI-compatible chat API when OPENAI_API_KEY is set; otherwise
// falls back to a realistic MOCK response so the app is fully testable.

// --- Human-readable labels for the coded profile/activity values ---
const GOAL_LABELS = {
  lose_weight: "lose weight",
  maintain: "maintain weight",
  fuel_training: "fuel training",
};
const DIET_LABELS = { veg: "vegetarian", egg: "eggetarian", non_veg: "non-vegetarian" };
const CUISINE_LABELS = {
  north: "North Indian",
  south: "South Indian",
  both: "North & South Indian",
};

function labelGoal(g) {
  return GOAL_LABELS[g] || g || "maintain weight";
}
function labelDiet(d) {
  return DIET_LABELS[d] || d || "vegetarian";
}
function labelCuisine(c) {
  return CUISINE_LABELS[c] || c || "North & South Indian";
}

// Meal time from the clock (server local time), overridable for testing.
function getMealTime(hour) {
  const h = hour != null ? hour : new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  return "dinner";
}

// --- Prompt construction ---
function buildSystemPrompt(category = "meal") {
  const isSnack = category === "snack";
  const intro = isSnack
    ? [
        "You are a sports nutritionist who specializes in everyday Indian food.",
        "Given a person's fitness profile and today's activity, suggest exactly 3 QUICK SNACKS for a post-activity refuel.",
        "",
        "Rules:",
        "- Snacks must be light, quick Indian options (little or no cooking, e.g. chaas, roasted chana, sprouts chaat, fruit + curd, peanut chikki).",
        "- Keep effort_minutes small (typically 0-10 minutes) and calories modest — these are snacks, not meals.",
        "- Match the snack to today's activity: a little protein/carb to recover; keep it light on rest days, especially if the goal is to lose weight.",
        "- Respect the diet (vegetarian / eggetarian / non-vegetarian) and cuisine comfort.",
        "- 'why_this_today' must be ONE short line that references the person's ACTUAL activity today and their goal.",
        "",
      ]
    : [
        "You are a sports nutritionist who specializes in everyday Indian home cooking.",
        "Given a person's fitness profile and today's activity, suggest exactly 3 meals for the given meal time.",
        "",
        "Rules:",
        "- Meals must be realistic Indian home cooking (dishes a home cook actually makes).",
        "- Match the meal to today's activity: bigger, protein- and carb-rich recovery meals after a hard or long run;",
        "  lighter meals on rest days, especially if the goal is to lose weight.",
        "- Respect the diet (vegetarian / eggetarian / non-vegetarian) and cuisine comfort.",
        "- Respect the cooking effort tolerance (max minutes) for each dish's effort_minutes.",
        "- 'why_this_today' must be ONE short line that references the person's ACTUAL activity today and their goal.",
        "",
      ];
  return [
    ...intro,
    "Return STRICT JSON only — no markdown, no prose, no code fences. Shape:",
    "[",
    "  {",
    '    "dish_name": string,',
    '    "why_this_today": string,',
    '    "calories": number,',
    '    "protein_grams": number,',
    '    "effort_minutes": number,',
    '    "ingredients": [ { "item": string, "quantity": string } ]',
    "  }",
    "]",
    "The top-level value MUST be a JSON array of exactly 3 objects.",
  ].join("\n");
}

function buildUserPrompt(profile, activity, mealTime, category = "meal") {
  const p = profile || {};
  const a = activity || {};
  const isSnack = category === "snack";
  const activityLine =
    a.type === "rest"
      ? "Rest day (no run/walk today)."
      : `${a.type || "run"} — ${a.distanceKm ?? 0} km in ${a.durationMin ?? 0} min, ` +
        `felt ${a.feel || "moderate"}, ~${a.calories ?? 0} kcal burned, intensity ${a.intensity || "Moderate"}.`;

  return [
    `Meal time: ${mealTime}.`,
    `Goal: ${labelGoal(p.goal)}.`,
    `Diet: ${labelDiet(p.diet)}.`,
    `Cuisine comfort: ${labelCuisine(p.cuisine)}.`,
    `Cooking effort tolerance: up to ${p.effort || 20} minutes per dish.`,
    `Today's activity: ${activityLine}`,
    a.daysSinceLastActivity != null
      ? `Days since last activity: ${a.daysSinceLastActivity}.`
      : "",
    "",
    isSnack
      ? "Suggest 3 quick post-activity SNACK options. Return STRICT JSON array only."
      : `Suggest 3 ${mealTime} options. Return STRICT JSON array only.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// --- Robust JSON extraction from a model response ---
function stripFences(text) {
  let t = (text || "").trim();
  // Remove leading ```json / ``` and trailing ```
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return t.trim();
}

function parseMeals(rawText) {
  const cleaned = stripFences(rawText);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Last resort: grab the first [...] block and try again.
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }
  // Some models wrap the array in an object like { meals: [...] }.
  if (!Array.isArray(parsed) && parsed && Array.isArray(parsed.meals)) {
    parsed = parsed.meals;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed.map(normalizeMeal).slice(0, 3);
}

function normalizeMeal(m) {
  const meal = m || {};
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  return {
    dish_name: String(meal.dish_name || "Meal"),
    why_this_today: String(meal.why_this_today || ""),
    calories: Number(meal.calories) || 0,
    protein_grams: Number(meal.protein_grams) || 0,
    effort_minutes: Number(meal.effort_minutes) || 0,
    ingredients: ingredients.map((ing) => ({
      item: String((ing && ing.item) || ""),
      quantity: String((ing && ing.quantity) || ""),
    })),
  };
}

// Optional: route the request through a corporate proxy (e.g. Netskope) so it
// egresses from an allowlisted IP. Set GATEWAY_PROXY or HTTPS_PROXY in .env.
// Returns a fetch `dispatcher` option, or undefined if no proxy configured.
function proxyDispatcher() {
  const proxyUrl = process.env.GATEWAY_PROXY || process.env.HTTPS_PROXY;
  if (!proxyUrl) return undefined;
  try {
    const { ProxyAgent } = require("undici");
    return new ProxyAgent(proxyUrl);
  } catch (e) {
    console.warn("[meals] proxy configured but 'undici' unavailable:", e.message);
    return undefined;
  }
}

// --- OpenAI-compatible API call ---
async function callLLM(profile, activity, mealTime, category = "meal") {
  const baseUrl = (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.MODEL_NAME || "gpt-4o-mini";
  const dispatcher = proxyDispatcher();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Bifrost gateways expect the virtual key in the x-bf-vk header.
      // Also send Authorization for plain OpenAI-compatible endpoints.
      "x-bf-vk": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    ...(dispatcher ? { dispatcher } : {}),
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt(category) },
        { role: "user", content: buildUserPrompt(profile, activity, mealTime, category) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// --- Mock response (used when no API key, or as graceful fallback) ---
function mockMeals(profile, activity, mealTime) {
  const goal = labelGoal(profile?.goal);
  const a = activity || {};
  const isRest = a.type === "rest";
  const isHard = a.feel === "hard" || (a.distanceKm || 0) >= 10;

  // Reference the real activity in the "why" line.
  const whyBase = isRest
    ? `Rest day + goal to ${goal}: keeping it light and balanced.`
    : `After your ${a.distanceKm || 0}km ${a.type || "run"} (${a.calories || 0} kcal, ${a.intensity || "Moderate"}), this supports your goal to ${goal}.`;

  const byMealTime = {
    breakfast: [
      {
        dish_name: "Moong Dal Chilla with Mint Chutney",
        why_this_today: whyBase,
        calories: isHard ? 420 : 330,
        protein_grams: 22,
        effort_minutes: 15,
        ingredients: [
          { item: "Yellow moong dal", quantity: "1 cup" },
          { item: "Onion", quantity: "1 small" },
          { item: "Green chilli", quantity: "1" },
          { item: "Coriander leaves", quantity: "handful" },
          { item: "Mint leaves", quantity: "1/2 cup" },
        ],
      },
      {
        dish_name: "Masala Oats Upma",
        why_this_today: whyBase,
        calories: isHard ? 400 : 300,
        protein_grams: 14,
        effort_minutes: 12,
        ingredients: [
          { item: "Rolled oats", quantity: "1 cup" },
          { item: "Mixed vegetables", quantity: "1 cup" },
          { item: "Mustard seeds", quantity: "1 tsp" },
          { item: "Curry leaves", quantity: "6-8" },
        ],
      },
      {
        dish_name: "Paneer Bhurji with Multigrain Toast",
        why_this_today: whyBase,
        calories: isHard ? 480 : 360,
        protein_grams: 26,
        effort_minutes: 18,
        ingredients: [
          { item: "Paneer", quantity: "150 g" },
          { item: "Onion", quantity: "1" },
          { item: "Tomato", quantity: "1" },
          { item: "Multigrain bread", quantity: "2 slices" },
        ],
      },
    ],
    lunch: [
      {
        dish_name: "Rajma Chawal with Cucumber Salad",
        why_this_today: whyBase,
        calories: isHard ? 620 : 480,
        protein_grams: 24,
        effort_minutes: 25,
        ingredients: [
          { item: "Rajma (kidney beans)", quantity: "1 cup" },
          { item: "Rice", quantity: "1 cup" },
          { item: "Onion", quantity: "2" },
          { item: "Tomato", quantity: "2" },
          { item: "Cucumber", quantity: "1" },
        ],
      },
      {
        dish_name: "Sambar with Brown Rice",
        why_this_today: whyBase,
        calories: isHard ? 560 : 430,
        protein_grams: 20,
        effort_minutes: 30,
        ingredients: [
          { item: "Toor dal", quantity: "1 cup" },
          { item: "Mixed vegetables", quantity: "2 cups" },
          { item: "Sambar powder", quantity: "2 tbsp" },
          { item: "Brown rice", quantity: "1 cup" },
        ],
      },
      {
        dish_name: "Chana Masala with Jeera Rice",
        why_this_today: whyBase,
        calories: isHard ? 600 : 460,
        protein_grams: 22,
        effort_minutes: 25,
        ingredients: [
          { item: "Chickpeas", quantity: "1 cup" },
          { item: "Onion", quantity: "2" },
          { item: "Tomato", quantity: "2" },
          { item: "Cumin seeds", quantity: "1 tsp" },
          { item: "Rice", quantity: "1 cup" },
        ],
      },
    ],
    dinner: [
      {
        dish_name: "Palak Paneer with Roti",
        why_this_today: whyBase,
        calories: isHard ? 560 : 420,
        protein_grams: 24,
        effort_minutes: 25,
        ingredients: [
          { item: "Spinach", quantity: "2 bunches" },
          { item: "Paneer", quantity: "150 g" },
          { item: "Whole wheat flour", quantity: "2 cups" },
          { item: "Garlic", quantity: "4 cloves" },
        ],
      },
      {
        dish_name: "Dal Tadka with Roti and Salad",
        why_this_today: whyBase,
        calories: isRest ? 350 : 460,
        protein_grams: 18,
        effort_minutes: 20,
        ingredients: [
          { item: "Toor dal", quantity: "1 cup" },
          { item: "Ghee", quantity: "1 tbsp" },
          { item: "Garlic", quantity: "4 cloves" },
          { item: "Whole wheat flour", quantity: "2 cups" },
        ],
      },
      {
        dish_name: "Vegetable Khichdi with Curd",
        why_this_today: whyBase,
        calories: isRest ? 330 : 440,
        protein_grams: 16,
        effort_minutes: 20,
        ingredients: [
          { item: "Rice", quantity: "3/4 cup" },
          { item: "Moong dal", quantity: "1/2 cup" },
          { item: "Mixed vegetables", quantity: "1 cup" },
          { item: "Curd", quantity: "1 cup" },
        ],
      },
    ],
  };

  return byMealTime[mealTime] || byMealTime.lunch;
}

// --- Mock snacks (light, quick, post-activity) ---
function mockSnacks(profile, activity) {
  const goal = labelGoal(profile?.goal);
  const a = activity || {};
  const isRest = a.type === "rest";
  const whyBase = isRest
    ? `Rest day + goal to ${goal}: a light, no-fuss nibble.`
    : `Quick refuel after your ${a.distanceKm || 0}km ${a.type || "run"} (${a.calories || 0} kcal) — supports your goal to ${goal}.`;

  return [
    {
      dish_name: "Masala Chaas + Roasted Chana",
      why_this_today: whyBase,
      calories: isRest ? 150 : 210,
      protein_grams: 10,
      effort_minutes: 5,
      ingredients: [
        { item: "Curd", quantity: "1 cup" },
        { item: "Roasted chana", quantity: "1/2 cup" },
        { item: "Cumin powder", quantity: "1/2 tsp" },
        { item: "Coriander leaves", quantity: "handful" },
      ],
    },
    {
      dish_name: "Sprouts & Pomegranate Chaat",
      why_this_today: whyBase,
      calories: isRest ? 160 : 230,
      protein_grams: 12,
      effort_minutes: 8,
      ingredients: [
        { item: "Moong sprouts", quantity: "1 cup" },
        { item: "Pomegranate", quantity: "1/2 cup" },
        { item: "Onion", quantity: "1 small" },
        { item: "Lemon", quantity: "1" },
      ],
    },
    {
      dish_name: "Banana with Peanut Butter",
      why_this_today: whyBase,
      calories: isRest ? 180 : 250,
      protein_grams: 8,
      effort_minutes: 2,
      ingredients: [
        { item: "Banana", quantity: "1" },
        { item: "Peanut butter", quantity: "1 tbsp" },
      ],
    },
  ];
}

// Pick the right mock set for the requested category.
function mockSuggestions(profile, activity, mealTime, category) {
  return category === "snack"
    ? mockSnacks(profile, activity)
    : mockMeals(profile, activity, mealTime);
}

// --- Public entry point ---
async function suggestMeals(profile, activity, mealTime, category = "meal") {
  const hasKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL);
  if (!hasKey) {
    return { meals: mockSuggestions(profile, activity, mealTime, category), source: "mock" };
  }
  try {
    const raw = await callLLM(profile, activity, mealTime, category);
    const meals = parseMeals(raw);
    if (!meals) {
      // Parse failure -> graceful fallback to mock.
      return {
        meals: mockSuggestions(profile, activity, mealTime, category),
        source: "mock_fallback",
        warning: "Could not parse model response; showing fallback suggestions.",
      };
    }
    return { meals, source: "api" };
  } catch (err) {
    return {
      meals: mockSuggestions(profile, activity, mealTime, category),
      source: "mock_fallback",
      warning: `API error: ${err.message}`,
    };
  }
}

module.exports = {
  getMealTime,
  buildSystemPrompt,
  buildUserPrompt,
  stripFences,
  parseMeals,
  mockMeals,
  mockSnacks,
  suggestMeals,
};
