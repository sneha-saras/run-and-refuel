import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSpeech, SUPPORTS_STT } from "../lib/useSpeech";

// Step 2 voice option: say what you did ("I just ran 5k, felt hard") and we
// turn it into an activity — so voice alone can drive the flow without Strava.
export default function VoiceActivity({ profile, onLogged }) {
  const { listening, interim, error, start, stop } = useSpeech();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => { if (listening && interim) setNote(`“${interim}”`); }, [listening, interim]);

  if (!SUPPORTS_STT) return null; // manual form + Strava still shown by parent

  async function handle(text) {
    setBusy(true);
    setNote(`Heard: “${text}”`);
    try {
      const res = await api.parseActivity(text, profile);
      onLogged(res.activity);
    } catch (e) {
      setNote("Couldn't understand that — try the manual form below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="voice-activity">
      <button
        type="button"
        className={`voice-activity__btn ${listening ? "is-listening" : ""}`}
        onClick={listening ? stop : () => start(handle)}
        disabled={busy}
      >
        <span className="voice-activity__mic">{listening ? "◼" : "🎤"}</span>
        <span>
          {busy ? "Working…" : listening ? "Listening… say what you did" : "Say what you did"}
        </span>
      </button>
      <p className="voice-activity__hint">e.g. “I just ran 5k and it felt hard”</p>
      {note && <p className="voice-activity__note">{note}</p>}
      {error && <p className="coach__stterror">🎤 {error}</p>}
    </div>
  );
}
