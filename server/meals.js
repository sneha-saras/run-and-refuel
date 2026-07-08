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

// --- Activity type → human label + fuel category ---
const ACTIVITY_LABELS = {
  run: "run",
  walk: "walk",
  cycle: "cycle ride",
  swim: "swim",
  gym: "strength / gym session",
  hiit: "HIIT session",
  yoga: "yoga / pilates session",
  sports: "sports session",
  rest: "rest day",
};
function labelActivity(t) {
  return ACTIVITY_LABELS[t] || t || "workout";
}
function fuelCategory(type) {
  if (["run", "cycle", "swim", "walk"].includes(type)) return "endurance";
  if (type === "gym") return "strength";
  if (type === "hiit") return "hiit";
  if (type === "yoga") return "low-burn";
  if (type === "sports") return "sports";
  if (type === "rest") return "rest";
  return "endurance";
}

// Guidance the model uses to reason DIFFERENTLY per activity type.
const ACTIVITY_GUIDANCE = [
  "Adjust the nutrition to the ACTIVITY TYPE (do NOT treat everything like a run):",
  "- Endurance (run, cycle, swim, long walk): prioritize carbohydrate replenishment + moderate protein.",
  "- Strength / gym: prioritize protein for muscle repair (post-workout timing); keep carbs moderate/lower.",
  "- HIIT: balance carbohydrates and protein.",
  "- Low-burn (yoga, pilates, light/short activity): keep it light / maintenance. Be HONEST that little refueling is needed — do NOT invent large recovery calorie needs.",
  "- Sports (football, cricket, badminton, etc.): treat by intensity/duration, generally endurance-like.",
  "- 'why_this_today' MUST reflect the actual activity type — e.g. 'protein to rebuild muscle after your strength session' vs 'carbs to replenish after your run'.",
];

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
        ...ACTIVITY_GUIDANCE,
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
        ...ACTIVITY_GUIDANCE,
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
  const type = a.type || "run";
  const distPart = a.distanceKm ? `${a.distanceKm} km, ` : ""; // omit for non-distance types
  const activityLine =
    type === "rest"
      ? "Rest day (no workout today)."
      : `${labelActivity(type)} [fuel category: ${fuelCategory(type)}] — ${distPart}${a.durationMin ?? 0} min, ` +
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

// Low-level chat completion against the configured OpenAI-compatible API.
// Shared by the meal engine and the coach chat — one client, one set of env
// vars, one proxy path. Takes a messages array, returns the content string.
async function chatCompletion(messages, { temperature = 0.7 } = {}) {
  const baseUrl = (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.MODEL_NAME || "gpt-4o-mini";
  const dispatcher = proxyDispatcher();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Bifrost gateways expect the virtual key in the x-bf-vk header.
      // Also send Authorization for plain OpenAI-compatible endpoints (Groq, etc).
      "x-bf-vk": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    ...(dispatcher ? { dispatcher } : {}),
    body: JSON.stringify({ model, temperature, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// --- OpenAI-compatible API call (meal engine) ---
async function callLLM(profile, activity, mealTime, category = "meal") {
  return chatCompletion([
    { role: "system", content: buildSystemPrompt(category) },
    { role: "user", content: buildUserPrompt(profile, activity, mealTime, category) },
  ]);
}

// --- Mock response (used when no API key, or as graceful fallback) ---
// Type-aware so the fallback still reasons by activity: protein-forward for
// strength, carb-rich for endurance, balanced for HIIT, light for low-burn.
function mockMeals(profile, activity, mealTime) {
  const goal = labelGoal(profile?.goal);
  const a = activity || {};
  const type = a.type || "run";
  const cat = fuelCategory(type);
  const isHard = a.feel === "hard" || (a.distanceKm || 0) >= 10;
  const bump = isHard && cat !== "low-burn" && cat !== "rest" ? 1.15 : 1; // scale up after hard efforts
  const s = (n) => Math.round(n * bump);
  const act = labelActivity(type);

  const why = {
    strength: `Protein to help rebuild muscle after your ${act}.`,
    endurance: `Carbs to replenish glycogen after your ${act}, with some protein.`,
    hiit: `Balanced carbs and protein to recover from your ${act}.`,
    "low-burn": `A light, balanced meal — little refueling needed after your ${act}.`,
    sports: `Carbs and protein to recover from your ${act}.`,
    rest: `Rest day + goal to ${goal}: keeping it light and balanced.`,
  }[cat];

  const SETS = {
    // Protein-forward, carbs moderate.
    strength: [
      { dish_name: "Paneer Bhurji with 2 Rotis", calories: s(480), protein_grams: 30, effort_minutes: 18,
        ingredients: [ { item: "Paneer", quantity: "200 g" }, { item: "Onion", quantity: "1" }, { item: "Tomato", quantity: "1" }, { item: "Whole wheat flour", quantity: "1.5 cups" } ] },
      { dish_name: "Rajma with a Small Bowl of Rice", calories: s(450), protein_grams: 22, effort_minutes: 25,
        ingredients: [ { item: "Rajma (kidney beans)", quantity: "1 cup" }, { item: "Onion", quantity: "2" }, { item: "Tomato", quantity: "2" }, { item: "Rice", quantity: "1/2 cup" } ] },
      { dish_name: "Soya Chunk Curry with Roti", calories: s(430), protein_grams: 28, effort_minutes: 20,
        ingredients: [ { item: "Soya chunks", quantity: "1 cup" }, { item: "Onion", quantity: "1" }, { item: "Tomato", quantity: "2" }, { item: "Whole wheat flour", quantity: "1.5 cups" } ] },
    ],
    // Carb-rich for glycogen replenishment.
    endurance: [
      { dish_name: "Rajma Chawal with Cucumber Salad", calories: s(560), protein_grams: 20, effort_minutes: 25,
        ingredients: [ { item: "Rajma (kidney beans)", quantity: "1 cup" }, { item: "Rice", quantity: "1 cup" }, { item: "Onion", quantity: "2" }, { item: "Cucumber", quantity: "1" } ] },
      { dish_name: "Aloo Paratha with Curd", calories: s(540), protein_grams: 14, effort_minutes: 20,
        ingredients: [ { item: "Potato", quantity: "3" }, { item: "Whole wheat flour", quantity: "2 cups" }, { item: "Curd", quantity: "1 cup" } ] },
      { dish_name: "Idli Sambar", calories: s(500), protein_grams: 16, effort_minutes: 25,
        ingredients: [ { item: "Idli batter", quantity: "2 cups" }, { item: "Toor dal", quantity: "1 cup" }, { item: "Mixed vegetables", quantity: "1.5 cups" }, { item: "Sambar powder", quantity: "2 tbsp" } ] },
    ],
    // Balanced carbs + protein.
    hiit: [
      { dish_name: "Chana Masala with Jeera Rice", calories: s(520), protein_grams: 22, effort_minutes: 25,
        ingredients: [ { item: "Chickpeas", quantity: "1 cup" }, { item: "Onion", quantity: "2" }, { item: "Tomato", quantity: "2" }, { item: "Rice", quantity: "3/4 cup" } ] },
      { dish_name: "Paneer Pulao with Raita", calories: s(520), protein_grams: 20, effort_minutes: 25,
        ingredients: [ { item: "Paneer", quantity: "150 g" }, { item: "Rice", quantity: "1 cup" }, { item: "Mixed vegetables", quantity: "1 cup" }, { item: "Curd", quantity: "1 cup" } ] },
      { dish_name: "Dal Khichdi with Curd", calories: s(470), protein_grams: 18, effort_minutes: 20,
        ingredients: [ { item: "Rice", quantity: "3/4 cup" }, { item: "Moong dal", quantity: "1/2 cup" }, { item: "Curd", quantity: "1 cup" } ] },
    ],
    // Light / maintenance — deliberately modest.
    "low-burn": [
      { dish_name: "Moong Dal Soup with Side Salad", calories: 230, protein_grams: 12, effort_minutes: 15,
        ingredients: [ { item: "Yellow moong dal", quantity: "1/2 cup" }, { item: "Carrot", quantity: "1" }, { item: "Cucumber", quantity: "1" }, { item: "Lemon", quantity: "1" } ] },
      { dish_name: "Sprouts & Veg Salad", calories: 210, protein_grams: 12, effort_minutes: 8,
        ingredients: [ { item: "Moong sprouts", quantity: "1 cup" }, { item: "Onion", quantity: "1" }, { item: "Tomato", quantity: "1" }, { item: "Lemon", quantity: "1" } ] },
      { dish_name: "Vegetable Daliya", calories: 250, protein_grams: 11, effort_minutes: 15,
        ingredients: [ { item: "Broken wheat (daliya)", quantity: "3/4 cup" }, { item: "Mixed vegetables", quantity: "1 cup" }, { item: "Cumin seeds", quantity: "1 tsp" } ] },
    ],
  };

  const set = SETS[cat] || (cat === "sports" ? SETS.endurance : cat === "rest" ? SETS["low-burn"] : SETS.endurance);
  return set.map((m) => ({ ...m, why_this_today: why }));
}

// --- Mock snacks (light, quick, post-activity) ---
function mockSnacks(profile, activity) {
  const goal = labelGoal(profile?.goal);
  const a = activity || {};
  const isRest = a.type === "rest";
  const whyBase = isRest
    ? `Rest day + goal to ${goal}: a light, no-fuss nibble.`
    : `Quick refuel after your ${labelActivity(a.type || "run")} (${a.calories || 0} kcal) — supports your goal to ${goal}.`;

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

// =====================================================================
// Coach chat — an ADDITIVE layer. Reuses chatCompletion + the same env
// vars and the same JSON parsing. Does not touch the meal-engine path.
// =====================================================================

function buildCoachSystemPrompt(profile, activity, currentMeals) {
  const p = profile || {};
  const a = activity || {};
  const activityLine =
    a.type === "rest"
      ? "Rest day (no run/walk today)."
      : `${a.type || "run"} — ${a.distanceKm ?? 0} km, ${a.durationMin ?? 0} min, felt ${a.feel || "moderate"}, ~${a.calories ?? 0} kcal, intensity ${a.intensity || "Moderate"}.`;

  return [
    "You are a friendly, practical Indian fitness meal coach.",
    "The user has already been shown 3 meal suggestions and wants to adjust them by chatting with you (typing or speaking).",
    "",
    "Their profile:",
    `- Goal: ${labelGoal(p.goal)}. Diet: ${labelDiet(p.diet)}. Cuisine: ${labelCuisine(p.cuisine)}. Effort tolerance: up to ${p.effort || 20} min/dish.`,
    `- Today's activity: ${activityLine}`,
    "",
    "Current suggestions on their screen:",
    JSON.stringify(currentMeals || [], null, 0),
    "",
    "Rules:",
    "- Read the WHOLE conversation and honor EVERY constraint the user has stated. If they said 'no paneer' earlier, never include paneer again — even in later turns.",
    "- Keep meals realistic Indian home cooking, matched to their activity and goal, respecting diet/cuisine/effort.",
    "- Always return exactly 3 updated suggestions in the same shape as before.",
    "- Adjust based on the latest message (e.g. quicker, lighter, cold, add something, swap an ingredient).",
    "- IMPORTANT: the meal cards are shown ABOVE the chat, so the user may not notice they changed. Your 'reply' MUST explicitly tell them the meals above were updated, and end with a light follow-up question.",
    "  End the reply with something like: \"✅ I've updated your meals above — want me to tweak anything else?\" (vary the wording naturally).",
    "",
    "Return STRICT JSON only — no markdown, no code fences, no prose outside the JSON. Shape:",
    "{",
    '  "reply": string,   // 1-2 friendly sentences acknowledging their message, ending by noting the meals above were updated + a light follow-up',
    '  "meals": [ { "dish_name": string, "why_this_today": string, "calories": number, "protein_grams": number, "effort_minutes": number, "ingredients": [ { "item": string, "quantity": string } ] } ]',
    "}",
    'The "meals" array MUST contain exactly 3 objects.',
  ].join("\n");
}

// Build the messages array for a coach turn: system context + full history.
function buildCoachMessages(profile, activity, currentMeals, history) {
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.content)
    .map((m) => ({
      role: m.role === "assistant" || m.role === "coach" ? "assistant" : "user",
      content: String(m.content),
    }));
  return [
    { role: "system", content: buildCoachSystemPrompt(profile, activity, currentMeals) },
    ...safeHistory,
  ];
}

// Parse a coach response into { reply, meals }. Reuses fence-stripping and the
// same meal normalization. `meals` is null if the model didn't return a usable set.
function parseCoachResponse(rawText) {
  const cleaned = stripFences(rawText);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { reply: cleaned || "", meals: null };
    try {
      parsed = JSON.parse(match[0]);
    } catch (e2) {
      return { reply: cleaned || "", meals: null };
    }
  }
  const reply = typeof parsed.reply === "string" ? parsed.reply : "";
  const meals = Array.isArray(parsed.meals)
    ? parsed.meals.map(normalizeMeal).slice(0, 3)
    : null;
  return { reply, meals: meals && meals.length ? meals : null };
}

async function coachReply(profile, activity, currentMeals, history) {
  const raw = await chatCompletion(buildCoachMessages(profile, activity, currentMeals, history));
  return parseCoachResponse(raw);
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
  chatCompletion,
  buildCoachMessages,
  parseCoachResponse,
  coachReply,
};
