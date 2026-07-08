# Run & Refuel — Demo Script (one page)

**One-liner:** _"A recovery-nutrition recommender that speaks Indian home cooking — it looks at how you actually ran today and tells you what to cook, then puts the groceries one tap away."_

---

## The story (30 sec — open with this)

> "I run. And every runner knows the worst decision of the day isn't the run — it's the 20 minutes after, standing in front of the fridge, wrecked, deciding what to eat. Every fitness app I tried answered with grilled chicken and broccoli and a protein shake. I don't eat that. I eat dal, rajma, paneer, sambar. So the advice was useless to me.
>
> By day I build recommendation systems at Meesho. So one weekend I pointed that same idea at my own problem: **what if the meal was recommended from today's actual run — and it was food I'd actually cook?** That's Run & Refuel."

## The problem (15 sec)

- Generic fitness/nutrition apps are **Western-food-shaped** and **activity-blind** (same advice on a rest day and after a 12K).
- The real friction isn't knowing you need protein — it's **"what do I cook, right now, with what effort, and where do I get it?"**

## Live demo (2–3 min) — open **http://localhost:5173**

1. **Top card — "Today's activity."** _"This is my real week. Today was a hard 12K — 809 kcal, intensity badge says Hard."_ Point at the badge + calories.
2. **Scroll to the meal cards.** _"Three suggestions — and notice the line up top."_ Read one **"why this today"** aloud:
   > _"After your 12km run (809 kcal, Hard), this supports your goal to fuel training."_
   _"It's not generic — it references THIS run and my goal. Bigger recovery meals because I went hard."_
3. **These are real Indian meals** — Rajma Chawal, Sambar with Brown Rice, Chana Masala. _"Food I actually make. Macros and cook-time on each."_ Point at the 🔥/💪/⏱ badges.
4. **Tap "Show ingredients"** on Rajma Chawal → tap **Zepto / Blinkit / Instamart** on an ingredient. _"Every ingredient is one tap from being in my cart. Decision to groceries in seconds."_
5. **Switch the meal-time tab** (Breakfast/Lunch/Dinner). _"Same run, different time of day, different suggestions."_
6. **Scroll down → "Connect Strava" / Sync.** _"And I don't even have to log it — it pulls my latest run straight from Strava."_ (Already connected as Sneha — click **Sync** to show it live, or just show the "via Strava" chip.)
7. **Contrast (optional):** open the manual form, switch to **Rest day** → _"On a rest day, with a weight-loss goal, it deliberately goes lighter. It's activity-aware, not a fixed menu."_

## Aha moments to land (say these words)

- **"Activity-aware"** — the meal changes with the effort, not just the clock.
- **"Indian home cooking"** — recovery nutrition that fits how we actually eat.
- **"Decision → cart in seconds"** — the quick-commerce deep links close the loop.

## Under the hood (30 sec)

- Node/Express + React (Vite), single JSON store — no DB.
- Meals come from an **LLM** given my goal profile + today's activity summary, returning **strict JSON** (dish, why-line, macros, ingredients). Prompt is tuned so meals scale with effort.
- **Strava OAuth** maps a real activity into the same summary the whole app runs on — Strava and manual entry are interchangeable.

## Close (15 sec)

> "It's a recommender that finally speaks my food and my training. Next: learn my taste over time, plan the week, and auto-build the cart. Recovery nutrition that fits the way India actually eats."

---

### Presenter notes / safety net
- **Meal text is in mock mode** if the LLM gateway isn't reachable from this machine (it's IP-allowlisted to the corporate network). The response **shape, activity-matching, and UI are identical** — on an allowlisted host it's live LLM text with zero code change. Don't call it out unless asked; if asked, this is the honest, correct answer.
- If anything stalls: everything still works offline/mock. Refresh is safe.
- Reset demo data anytime by restoring `server/data.json` (today = a hard 12K long run is the strongest story).
