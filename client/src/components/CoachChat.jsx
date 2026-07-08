import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSpeech, speak, stopSpeaking, SUPPORTS_STT, SUPPORTS_TTS } from "../lib/useSpeech";

const PROMPTS = [
  "I'm exhausted, don't feel like cooking",
  "I'm starving",
  "Something cold",
  "No paneer",
];

// The coach's opening line in Step 3 — marks the shift from GATHERING the
// activity to ADJUSTING the meals, referencing what was captured.
function introFor(a) {
  const tail = "Want me to tweak anything — quicker, lighter, no paneer, something cold?";
  if (!a) return `Here are your refuel suggestions below. ${tail}`;
  if (a.type === "rest") return `Based on your rest day, here are your refuel suggestions below. ${tail}`;
  const dist = a.distanceKm ? `${a.distanceKm}km ` : "";
  return `Based on your ${dist}${a.type}, here are your refuel suggestions below. ${tail}`;
}

// Voice-first coach hero. Speaks with you: hear your activity + goal (already
// known) fused with what you say now (mood, cravings, constraints) -> updated
// meals + a spoken reply.
export default function CoachChat({ meals, profile, activity, onMealsUpdated }) {
  const [messages, setMessages] = useState(() => [{ role: "coach", content: introFor(activity) }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceReply, setVoiceReply] = useState(SUPPORTS_TTS); // spoken reply ON by default
  const { listening, interim, error: sttError, start, stop } = useSpeech();

  const listRef = useRef(null);
  const mealsRef = useRef(meals);
  const messagesRef = useRef(messages);
  const profileRef = useRef(profile);
  const activityRef = useRef(activity);
  useEffect(() => { mealsRef.current = meals; }, [meals]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { activityRef.current = activity; }, [activity]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);
  useEffect(() => () => stopSpeaking(), []);
  // Show the live transcript in the input box while speaking.
  useEffect(() => { if (listening && interim) setInput(interim); }, [listening, interim]);

  async function send(text) {
    const content = (text || "").trim();
    if (!content || loading) return;
    const history = [...messagesRef.current, { role: "user", content }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const payload = history.map((m) => ({
        role: m.role === "coach" ? "assistant" : "user",
        content: m.content,
      }));
      const res = await api.coach(payload, mealsRef.current, profileRef.current, activityRef.current);
      const reply = res.reply || "Here are some updated ideas.";
      setMessages((h) => [...h, { role: "coach", content: reply }]);
      if (res.meals && res.meals.length) onMealsUpdated(res.meals);
      if (voiceReply) speak(reply);
    } catch (e) {
      setMessages((h) => [
        ...h,
        { role: "coach", content: "Sorry, I couldn't update just now — your current meals are unchanged. Try again?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <section className="coach-hero">
      <div className="coach-hero__head">
        <div>
          <h2 className="coach-hero__title">🎤 Talk to your coach</h2>
          <p className="coach-hero__sub">
            I know your run — now tell me how you feel or what you want.
          </p>
        </div>
        {SUPPORTS_TTS && (
          <button
            type="button"
            className={`coach__voice-toggle ${voiceReply ? "is-on" : ""}`}
            onClick={() => {
              if (voiceReply) stopSpeaking();
              setVoiceReply((v) => !v);
            }}
          >
            {voiceReply ? "🔊 Voice on" : "🔈 Voice off"}
          </button>
        )}
      </div>

      {/* The big, obvious mic */}
      {SUPPORTS_STT && (
        <div className="mic-hero">
          <button
            type="button"
            className={`mic-hero__btn ${listening ? "is-listening" : ""}`}
            onClick={listening ? stop : () => start(send)}
            aria-label={listening ? "Stop listening" : "Tap to speak"}
          >
            {listening ? "◼" : "🎤"}
          </button>
          <div className="mic-hero__label">
            {listening ? (interim ? `“${interim}”` : "Listening… speak now") : "Tap and speak"}
          </div>
        </div>
      )}

      {/* Example prompts */}
      <div className="coach__suggestions">
        {PROMPTS.map((s) => (
          <button key={s} type="button" className="coach__chip" onClick={() => send(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      {/* Transcript */}
      {(messages.length > 0 || loading) && (
        <div className="coach__messages" ref={listRef}>
          {messages.map((m, i) => (
            <div key={i} className={`bubble bubble--${m.role}`}>{m.content}</div>
          ))}
          {loading && <div className="bubble bubble--coach bubble--typing">Coach is thinking…</div>}
        </div>
      )}

      {/* Typing fallback — always available */}
      <form className="coach__input-row" onSubmit={onSubmit}>
        <input
          className="coach__input"
          type="text"
          value={input}
          placeholder="…or type it here"
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button className="coach__send" type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>

      {!SUPPORTS_STT && (
        <p className="coach__nostt">Voice input isn't supported in this browser — typing works fine.</p>
      )}
      {sttError && <p className="coach__stterror">🎤 {sttError}</p>}
    </section>
  );
}
