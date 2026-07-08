import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSpeech, speak, stopSpeaking, SUPPORTS_STT, SUPPORTS_TTS } from "../lib/useSpeech";

const OPENER = "Tell me about today's workout — what did you do?";

// Conversational activity capture. The coach asks follow-ups (distance/
// duration) until it has enough, THEN hands the captured activity to the
// parent (which moves on to meals). Voice-first, with a typing fallback.
export default function CoachActivity({ profile, onCaptured }) {
  const [messages, setMessages] = useState([{ role: "coach", content: OPENER }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceReply, setVoiceReply] = useState(SUPPORTS_TTS);
  const { listening, interim, error: sttError, start, stop } = useSpeech();

  const listRef = useRef(null);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { if (listening && interim) setInput(interim); }, [listening, interim]);

  async function send(text) {
    const content = (text || "").trim();
    if (!content || loading) return;
    const history = [...messagesRef.current, { role: "user", content }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const payload = history
        .filter((m) => m.content !== OPENER) // don't send our canned opener
        .map((m) => ({ role: m.role === "coach" ? "assistant" : "user", content: m.content }));
      const res = await api.gatherActivity(payload, profile);
      const reply = res.reply || "Tell me a bit more about your workout.";
      setMessages((h) => [...h, { role: "coach", content: reply }]);
      if (voiceReply) speak(reply);
      if (res.complete && res.activity) {
        // Small beat so the confirming line is seen/heard, then move to meals.
        setTimeout(() => onCaptured(res.activity), 700);
      }
    } catch (e) {
      setMessages((h) => [
        ...h,
        { role: "coach", content: "Sorry, I didn't catch that — try again, or use the manual form below." },
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
    <div className="coach-activity">
      <div className="coach-hero__head">
        <div>
          <h3 className="coach-hero__title">🎤 Tell me about your run</h3>
          <p className="coach-hero__sub">Speak or type — I'll ask if I need more.</p>
        </div>
        {SUPPORTS_TTS && (
          <button
            type="button"
            className={`coach__voice-toggle ${voiceReply ? "is-on" : ""}`}
            onClick={() => { if (voiceReply) stopSpeaking(); setVoiceReply((v) => !v); }}
          >
            {voiceReply ? "🔊 Voice on" : "🔈 Voice off"}
          </button>
        )}
      </div>

      {SUPPORTS_STT && (
        <div className="mic-hero">
          <button
            type="button"
            className={`mic-hero__btn ${listening ? "is-listening" : ""}`}
            onClick={listening ? stop : () => start(send)}
            aria-label={listening ? "Stop listening" : "Tap to speak"}
            disabled={loading}
          >
            {listening ? "◼" : "🎤"}
          </button>
          <div className="mic-hero__label">
            {listening ? (interim ? `“${interim}”` : "Listening… speak now") : "Tap and speak"}
          </div>
        </div>
      )}

      <div className="coach__messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>{m.content}</div>
        ))}
        {loading && <div className="bubble bubble--coach bubble--typing">…</div>}
      </div>

      <form className="coach__input-row" onSubmit={onSubmit}>
        <input
          className="coach__input"
          type="text"
          value={input}
          placeholder="e.g. I ran 5k, felt hard"
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button className="coach__send" type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>

      {!SUPPORTS_STT && (
        <p className="coach__nostt">Voice input isn't supported here — typing works fine.</p>
      )}
      {sttError && <p className="coach__stterror">🎤 {sttError}</p>}
    </div>
  );
}
