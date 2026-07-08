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
// How long a silence ends the turn. Continuous mode + this timer means a short
// natural pause mid-sentence does NOT cut you off — only a longer silence does.
const SILENCE_MS = 2600;

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const transcriptRef = useRef("");
  const silenceRef = useRef(null);

  function clearSilence() {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  }

  function start(onFinal) {
    if (!SUPPORTS_STT || listening) return;
    setError(null);
    setInterim("");
    transcriptRef.current = "";
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true; // don't end on the first pause

    const armSilence = () => {
      clearSilence();
      silenceRef.current = setTimeout(() => {
        try { rec.stop(); } catch (e) {}
      }, SILENCE_MS);
    };

    rec.onstart = () => {
      setListening(true);
      armSilence();
    };
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      transcriptRef.current = t;
      setInterim(t);
      armSilence(); // reset the silence countdown on every bit of speech
    };
    rec.onerror = (e) => {
      clearSilence();
      setListening(false);
      const msg = errorMessage(e && e.error);
      if (msg) setError(msg);
    };
    rec.onend = () => {
      clearSilence();
      setListening(false);
      const finalText = transcriptRef.current.trim();
      transcriptRef.current = "";
      setInterim("");
      if (finalText && onFinal) onFinal(finalText);
    };

    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch (err) {
      clearSilence();
      setListening(false);
      setError(`Couldn't start the mic (${err.name}). Try again in a moment.`);
    }
  }

  function stop() {
    clearSilence();
    try {
      if (recRef.current) recRef.current.stop();
    } catch (e) {}
    setListening(false);
  }

  return { listening, interim, error, start, stop };
}
