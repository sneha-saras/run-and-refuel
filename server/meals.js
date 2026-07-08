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
    "- React to MOOD, ENERGY, CRAVINGS and constraints the user voices: 'exhausted / don't feel like cooking' -> minimal-effort, comforting, low effort_minutes; 'starving' -> more filling/calorie-dense; 'something cold' -> cold/no-cook dishes; 'light' -> lighter.",
    "- FUSE both signals: your reply should reference BOTH their actual activity today AND what they just said (e.g. 'After your 5k and since you're wiped, here's a no-cook option...').",
    "- IMPORTANT: the meal cards are shown near the chat, so the user may not notice they changed. Your 'reply' MUST explicitly tell them the meals were updated, and end with a light follow-up question.",
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

// =====================================================================
// Voice-driven activity: turn a spoken sentence ("I just ran 5k, felt
// hard") into the raw activity input. Lets voice alone drive the flow
// without Strava or the manual form.
// =====================================================================

function naiveParseActivity(text) {
  const t = (text || "").toLowerCase();
  const type = /\bwalk|walked|walking\b/.test(t)
    ? "walk"
    : /\brest|didn'?t|nothing|no run|off day|skipped\b/.test(t)
    ? "rest"
    : "run";
  const km = (t.match(/(\d+(?:\.\d+)?)\s*k/) || [])[1];
  const min = (t.match(/(\d+)\s*(?:min|minute)/) || [])[1];
  const feel = /hard|tough|exhaust|intense|brutal|fast/.test(t)
    ? "hard"
    : /easy|light|chill|slow|relaxed/.test(t)
    ? "easy"
    : "moderate";
  const distanceKm = type === "rest" ? 0 : km ? Number(km) : 5;
  const durationMin = type === "rest" ? 0 : min ? Number(min) : Math.round(distanceKm * 6);
  return { type, distanceKm, durationMin, feel };
}

// --- Conversational activity gathering ---
// The coach converses to capture today's activity, asking a follow-up when key
// info is missing instead of guessing. Returns { reply, complete, fields }.

const GATHER_SYSTEM = [
  "You are a friendly running coach. Your ONLY job right now is to find out what the user did today, so you can suggest recovery meals next.",
  "You need: (1) activity type — run, walk, or rest day — AND (2) at least one of distance (km) or duration (minutes). How it felt (easy/moderate/hard) is a nice bonus.",
  "",
  "Rules:",
  "- If you do NOT yet have type + (distance OR duration), ask ONE short, friendly follow-up for the single most important missing piece (e.g. 'Nice — how far did you run?' or 'How long were you out?'). Do NOT guess and do NOT proceed.",
  "- Never ask for something already stated. Ask only for what's missing, one question at a time.",
  "- A rest day needs no distance — it's complete immediately.",
  "- Once you have enough, set complete=true, fill the activity fields, and give a brief confirming reply like 'Got it — a 5k run. Pulling your refuel options…'.",
  "",
  "Return STRICT JSON only — no markdown, no fences, no prose outside the JSON:",
  '{ "reply": string, "complete": boolean, "activity": { "type": "run"|"walk"|"rest", "distanceKm": number, "durationMin": number, "feel": "easy"|"moderate"|"hard" } | null }',
  "When complete is false, activity MUST be null.",
].join("\n");

// Fill a missing distance/duration from the other using a rough pace, so the
// calorie math (which needs duration) is never zero when only distance is given.
function fillActivityGaps(f) {
  if (f.type === "rest") {
    f.distanceKm = 0;
    f.durationMin = 0;
    return f;
  }
  const paceMinPerKm = f.type === "walk" ? 11 : 6; // ~6:00/km run, ~11:00/km walk
  if (!f.durationMin && f.distanceKm) f.durationMin = Math.round(f.distanceKm * paceMinPerKm);
  if (!f.distanceKm && f.durationMin) f.distanceKm = +(f.durationMin / paceMinPerKm).toFixed(1);
  // Guard against mis-heard/mis-parsed values (e.g. "5k" -> 5000). Keep sane.
  f.distanceKm = Math.min(Math.max(f.distanceKm, 0), 100);
  f.durationMin = Math.min(Math.max(f.durationMin, 0), 600);
  return f;
}

function normalizeFields(o) {
  return fillActivityGaps({
    type: ["run", "walk", "rest"].includes(o && o.type) ? o.type : "run",
    distanceKm: Number(o && o.distanceKm) || 0,
    durationMin: Number(o && o.durationMin) || 0,
    feel: ["easy", "moderate", "hard"].includes(o && o.feel) ? o.feel : "moderate",
  });
}

// DETERMINISTIC completeness gate: we only have "enough" when the user actually
// stated a rest day, or a distance/duration quantity. This does NOT trust the
// model's own `complete` flag — it prevents the model from guessing a distance
// and skipping the follow-up question.
function userTextOf(history) {
  return (history || [])
    .filter((m) => m && m.role !== "assistant" && m.role !== "coach")
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();
}
function isRestText(t) {
  return /\brest\b|didn'?t|nothing|off day|skipped|no run|no workout/.test(t);
}
function hasQuantity(t) {
  // a number (5k, 10 km, 30 min, 45), or an hour reference in words
  return /\d/.test(t) || /\b(an?\s+hour|half\s+an\s+hour|hour|hrs?)\b/.test(t);
}
function followUpQuestion(t) {
  const verb = /\bwalk|walked|walking\b/.test(t) ? "walk" : "run";
  return `Nice! How far did you ${verb}, or how long were you out?`;
}

async function gatherActivity(profile, history) {
  const t = userTextOf(history);
  const enough = isRestText(t) || hasQuantity(t);
  const hasKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL);

  // Not enough info yet -> ALWAYS ask a follow-up, never generate meals.
  if (!enough) {
    let reply = followUpQuestion(t);
    if (hasKey) {
      // Let the model phrase the question naturally, but keep it a question.
      try {
        const raw = await chatCompletion(
          [{ role: "system", content: GATHER_SYSTEM }, ...toLLM(history)],
          { temperature: 0.3 }
        );
        const o = JSON.parse((stripFences(raw).match(/\{[\s\S]*\}/) || [])[0] || "{}");
        if (o && o.complete === false && typeof o.reply === "string" && o.reply.includes("?")) {
          reply = o.reply;
        }
      } catch (e) {
        /* keep the canned question */
      }
    }
    return { reply, complete: false, fields: null };
  }

  // Enough info -> confirm + extract fields.
  if (!hasKey) {
    return {
      reply: "Got it — pulling your refuel options…",
      complete: true,
      fields: fillActivityGaps(naiveParseActivity(t)),
    };
  }
  try {
    const raw = await chatCompletion(
      [{ role: "system", content: GATHER_SYSTEM }, ...toLLM(history)],
      { temperature: 0.3 }
    );
    const o = JSON.parse((stripFences(raw).match(/\{[\s\S]*\}/) || [])[0] || "{}");
    const fields = normalizeFields(o && o.activity ? o.activity : naiveParseActivity(t));
    const reply =
      typeof o.reply === "string" && o.reply.trim()
        ? o.reply
        : "Got it — pulling your refuel options…";
    return { reply, complete: true, fields };
  } catch (e) {
    return {
      reply: "Got it — pulling your refuel options…",
      complete: true,
      fields: fillActivityGaps(naiveParseActivity(t)),
    };
  }
}

function toLLM(history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && m.content)
    .map((m) => ({
      role: m.role === "assistant" || m.role === "coach" ? "assistant" : "user",
      content: String(m.content),
    }));
}

async function parseActivityFromText(text) {
  const hasKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL);
  if (!hasKey) return naiveParseActivity(text);
  const sys = [
    "Extract the workout from the user's sentence. Return STRICT JSON only (no prose, no fences):",
    '{ "type": "run" | "walk" | "rest", "distanceKm": number, "durationMin": number, "feel": "easy" | "moderate" | "hard" }',
    "If distance or duration isn't stated, estimate sensibly (a 5k run is ~30 min). If they did no exercise / a rest day, use type 'rest' with zeros.",
  ].join("\n");
  try {
    const raw = await chatCompletion(
      [{ role: "system", content: sys }, { role: "user", content: text }],
      { temperature: 0.2 }
    );
    const cleaned = stripFences(raw);
    const match = cleaned.match(/\{[\s\S]*\}/);
    const o = JSON.parse(match ? match[0] : cleaned);
    return {
      type: ["run", "walk", "rest"].includes(o.type) ? o.type : "run",
      distanceKm: Number(o.distanceKm) || 0,
      durationMin: Number(o.durationMin) || 0,
      feel: ["easy", "moderate", "hard"].includes(o.feel) ? o.feel : "moderate",
    };
  } catch (e) {
    return naiveParseActivity(text); // graceful fallback
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
  chatCompletion,
  buildCoachMessages,
  parseCoachResponse,
  coachReply,
  parseActivityFromText,
  gatherActivity,
};
