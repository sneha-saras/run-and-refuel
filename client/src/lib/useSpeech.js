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
// A real silence (no speech for this long) ends the turn. Because Chrome tends
// to fire `onend` on its own after a short pause, we AUTO-RESTART recognition
// while the user is still "active" and only finish on a genuine silence or when
// the user taps stop. This is what stops mid-sentence pauses from cutting off.
const SILENCE_MS = 2600;

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const activeRef = useRef(false); // user wants to keep listening
  const committedRef = useRef(""); // transcript accumulated across restarts
  const sessionRef = useRef(""); // current recognition session's transcript
  const silenceRef = useRef(null);
  const onFinalRef = useRef(null);

  function clearSilence() {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  }
  function armSilence() {
    clearSilence();
    silenceRef.current = setTimeout(() => {
      activeRef.current = false; // real silence -> we're done
      try { if (recRef.current) recRef.current.stop(); } catch (e) {}
    }, SILENCE_MS);
  }

  function finish() {
    clearSilence();
    const text = `${committedRef.current} ${sessionRef.current}`.trim();
    committedRef.current = "";
    sessionRef.current = "";
    setInterim("");
    setListening(false);
    if (text && onFinalRef.current) onFinalRef.current(text);
  }

  function buildRec() {
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onstart = () => {
      setListening(true);
      armSilence();
    };
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      sessionRef.current = t;
      setInterim(`${committedRef.current} ${t}`.trim());
      armSilence(); // reset countdown on every bit of speech
    };
    rec.onerror = (e) => {
      const code = e && e.error;
      // "no-speech" before anything was said -> stop; otherwise keep listening.
      if (code === "no-speech") {
        if (!committedRef.current && !sessionRef.current) activeRef.current = false;
        return;
      }
      clearSilence();
      activeRef.current = false;
      const msg = errorMessage(code);
      if (msg) setError(msg);
      setListening(false);
    };
    rec.onend = () => {
      if (activeRef.current) {
        // Chrome ended early — commit this chunk and restart to keep going.
        committedRef.current = `${committedRef.current} ${sessionRef.current}`.trim();
        sessionRef.current = "";
        try { rec.start(); } catch (e) { finish(); }
      } else {
        finish();
      }
    };
    return rec;
  }

  function start(onFinal) {
    if (!SUPPORTS_STT || listening) return;
    setError(null);
    setInterim("");
    committedRef.current = "";
    sessionRef.current = "";
    onFinalRef.current = onFinal;
    activeRef.current = true;
    const rec = buildRec();
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch (err) {
      activeRef.current = false;
      setListening(false);
      setError(`Couldn't start the mic (${err.name}). Try again in a moment.`);
    }
  }

  function stop() {
    activeRef.current = false; // user says done
    clearSilence();
    try {
      if (recRef.current) recRef.current.stop();
    } catch (e) {}
  }

  return { listening, interim, error, start, stop };
}
