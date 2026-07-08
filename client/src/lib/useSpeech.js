import { useRef, useState } from "react";

// Browser Web Speech API (no external service, no cost).
const SR =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export const SUPPORTS_STT = !!SR;
export const SUPPORTS_TTS = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text) {
  if (!SUPPORTS_TTS || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-IN";
  u.rate = 1.03;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (SUPPORTS_TTS) window.speechSynthesis.cancel();
}

function errorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked — allow the mic in the address bar, then try again.";
    case "network":
      return "Voice recognition couldn't reach the speech service (sometimes blocked on corporate networks). Typing works.";
    case "no-speech":
      return "Didn't catch that — tap the mic and speak.";
    case "audio-capture":
      return "No microphone found.";
    case "aborted":
      return null;
    default:
      return `Voice error: ${code}. Typing still works.`;
  }
}

// Speech-to-text hook. start(onFinal) begins listening and calls onFinal(text)
// once the user stops speaking. Exposes live interim transcript + errors.
export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const finalRef = useRef("");

  function start(onFinal) {
    if (!SUPPORTS_STT || listening) return;
    setError(null);
    setInterim("");
    finalRef.current = "";
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInterim(t);
      if (e.results[e.results.length - 1].isFinal) finalRef.current = t;
    };
    rec.onerror = (e) => {
      setListening(false);
      const msg = errorMessage(e && e.error);
      if (msg) setError(msg);
    };
    rec.onend = () => {
      setListening(false);
      const finalText = finalRef.current.trim();
      finalRef.current = "";
      setInterim("");
      if (finalText && onFinal) onFinal(finalText);
    };

    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch (err) {
      setListening(false);
      setError(`Couldn't start the mic (${err.name}). Try again in a moment.`);
    }
  }

  function stop() {
    try {
      if (recRef.current) recRef.current.stop();
    } catch (e) {}
    setListening(false);
  }

  return { listening, interim, error, start, stop };
}
