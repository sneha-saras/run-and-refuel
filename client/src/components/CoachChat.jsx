import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Feature detection for the browser Web Speech APIs (no external service).
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const SUPPORTS_STT = !!SR;
const SUPPORTS_TTS = typeof window !== "undefined" && "speechSynthesis" in window;

const SUGGESTIONS = [
  "I don't have paneer",
  "Something quick today",
  "I want something cold",
  "I'm still hungry, add something",
];

export default function CoachChat({ meals, profile, activity, onMealsUpdated }) {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'coach', content }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [sttError, setSttError] = useState(null);

  const recognitionRef = useRef(null);
  const finalRef = useRef("");
  const listRef = useRef(null);
  // Keep the latest meals in a ref so the speech-recognition onend closure
  // (created when the mic starts) always sends the current suggestions.
  const mealsRef = useRef(meals);
  const messagesRef = useRef(messages);
  const profileRef = useRef(profile);
  const activityRef = useRef(activity);
  useEffect(() => { mealsRef.current = meals; }, [meals]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { activityRef.current = activity; }, [activity]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  // Stop any speech synthesis when unmounting.
  useEffect(() => () => { if (SUPPORTS_TTS) window.speechSynthesis.cancel(); }, []);

  function speak(text) {
    if (!SUPPORTS_TTS || !voiceReply) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }

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
      speak(reply);
    } catch (e) {
      // Never break the existing view — keep current meals, show a friendly note.
      setMessages((h) => [
        ...h,
        { role: "coach", content: "Sorry, I couldn't update just now — your current meals are unchanged. Try again?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function sttErrorMessage(code) {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone access is blocked. Click the 🎤/lock icon in the address bar and allow the mic, then try again.";
      case "network":
        return "Voice recognition couldn't reach the speech service (often blocked on corporate networks/VPN). Typing still works.";
      case "no-speech":
        return "Didn't catch anything — tap the mic and speak.";
      case "audio-capture":
        return "No microphone found. Check your input device.";
      case "aborted":
        return null; // user/other cancel — no need to alarm
      default:
        return `Voice input error: ${code}. Typing still works.`;
    }
  }

  function startListening() {
    if (!SUPPORTS_STT || listening) return;
    setSttError(null);
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = "";

    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) finalRef.current = transcript;
    };
    rec.onerror = (e) => {
      setListening(false);
      const msg = sttErrorMessage(e && e.error);
      if (msg) setSttError(msg);
    };
    rec.onend = () => {
      setListening(false);
      const finalText = finalRef.current.trim();
      finalRef.current = "";
      if (finalText) send(finalText); // auto-send when the user stops speaking
    };

    recognitionRef.current = rec;
    setListening(true); // optimistic; onstart confirms
    try {
      rec.start();
    } catch (err) {
      // e.g. InvalidStateError if a prior session is still closing
      setListening(false);
      setSttError(`Couldn't start the mic (${err.name}). Try again in a moment.`);
    }
  }

  function stopListening() {
    try { recognitionRef.current && recognitionRef.current.stop(); } catch (e) {}
    setListening(false);
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <section className="coach">
      <div className="coach__head">
        <h2 className="section-title">🧑‍🍳 Talk to your coach</h2>
        {SUPPORTS_TTS && (
          <button
            type="button"
            className={`coach__voice-toggle ${voiceReply ? "is-on" : ""}`}
            onClick={() => {
              if (voiceReply) window.speechSynthesis.cancel();
              setVoiceReply((v) => !v);
            }}
            title="Read the coach's replies aloud"
          >
            {voiceReply ? "🔊 Voice on" : "🔈 Voice off"}
          </button>
        )}
      </div>

      <p className="coach__hint">
        Push back on the suggestions — type or tap the mic and speak.
      </p>

      <div className="coach__messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="coach__suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="coach__chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="bubble bubble--coach bubble--typing">Coach is thinking…</div>}
      </div>

      {listening && (
        <div className="coach__listening">
          <span className="pulse" /> Listening… speak now
        </div>
      )}

      <form className="coach__input-row" onSubmit={onSubmit}>
        <input
          className="coach__input"
          type="text"
          value={input}
          placeholder="e.g. no paneer, something quick…"
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        {SUPPORTS_STT && (
          <button
            type="button"
            className={`coach__mic ${listening ? "is-listening" : ""}`}
            onClick={listening ? stopListening : startListening}
            title={listening ? "Stop" : "Speak"}
            aria-label={listening ? "Stop listening" : "Start voice input"}
          >
            {listening ? "◼" : "🎤"}
          </button>
        )}
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
