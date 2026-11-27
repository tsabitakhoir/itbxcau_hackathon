// Voice guidance (audio mode for blind / low-vision users). Uses the browser's
// built-in speech synthesis only: no recording, no network, no AI.
import type { Lang } from '../core/types';

const VOICE_LANG: Record<Lang, string> = { en: 'en-US', id: 'id-ID', ko: 'ko-KR' };
export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Text the browser refused to speak because no gesture was active yet. It is retried on the next
// tap/release (inside a real gesture), so a long-press that was blocked still gets heard.
let pending: { text: string; lang: Lang } | null = null;

export function speak(text: string, lang: Lang, interrupt = true) {
  if (!voiceSupported() || !text) return;
  const s = window.speechSynthesis;
  const busy = s.speaking || s.pending;
  if (interrupt && busy) s.cancel();
  const run = () => {
    if (s.paused) s.resume(); // a browser can leave the engine paused after tab switches
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[lang]; u.rate = 0.95;
    const v = s.getVoices().find((x) => x.lang.toLowerCase().startsWith(VOICE_LANG[lang].slice(0, 2)));
    if (v) u.voice = v;
    let started = false;
    u.onstart = () => { started = true; if (pending?.text === text) pending = null; };
    u.onerror = (e) => { if (e.error === 'not-allowed') pending = { text, lang }; };
    s.speak(u);
    // Some mobile engines drop the utterance without any error: keep it for the next gesture.
    window.setTimeout(() => { if (!started && !s.speaking) pending = { text, lang }; }, 1200);
  };
  // Android Chrome drops a speak() issued right after cancel(), so give it a beat.
  if (interrupt && busy) window.setTimeout(run, 80); else run();
}
/** Call from a tap / pointer release: speaks anything the browser blocked earlier. */
export function flushPendingSpeech() {
  if (!pending) return;
  const p = pending; pending = null; speak(p.text, p.lang);
}
export function stopSpeaking() { if (voiceSupported()) window.speechSynthesis.cancel(); }

/**
 * Mobile browsers only let speech start after the page has had a real tap/key press, and a
 * long-press timer or a route change fires too late to count. Playing one silent utterance on the
 * very first gesture "unlocks" speech for the rest of the visit, so voice works from app open.
 */
let unlocked = false; let lastTry = 0;
export function unlockVoice() {
  if (unlocked || !voiceSupported() || Date.now() - lastTry < 1000) return;
  lastTry = Date.now();
  try {
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.rate = 2;
    u.onstart = () => { unlocked = true; };
    window.speechSynthesis.getVoices(); // starts loading the voice list
    window.speechSynthesis.speak(u);
  } catch { /* try again on the next gesture */ }
}
