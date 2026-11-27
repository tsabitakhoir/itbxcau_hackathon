// Voice guidance (audio mode for blind / low-vision users). Uses the browser's
// built-in speech synthesis only: no recording, no network, no AI.
import type { Lang } from '../core/types';

const VOICE_LANG: Record<Lang, string> = { en: 'en-US', id: 'id-ID', ko: 'ko-KR' };
export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, lang: Lang, interrupt = true) {
  if (!voiceSupported() || !text) return;
  const s = window.speechSynthesis;
  if (interrupt) s.cancel();
  if (s.paused) s.resume(); // a browser can leave the engine paused after tab switches
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE_LANG[lang]; u.rate = 0.95;
  const v = s.getVoices().find((x) => x.lang.toLowerCase().startsWith(VOICE_LANG[lang].slice(0, 2)));
  if (v) u.voice = v;
  s.speak(u);
}
export function stopSpeaking() { if (voiceSupported()) window.speechSynthesis.cancel(); }

/**
 * Mobile browsers only let speech start after the page has had a real tap/key press, and a
 * long-press timer or a route change fires too late to count. Playing one silent utterance on the
 * very first gesture "unlocks" speech for the rest of the visit, so voice works from app open.
 */
let unlocked = false;
export function unlockVoice() {
  if (unlocked || !voiceSupported()) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.rate = 2;
    window.speechSynthesis.getVoices(); // starts loading the voice list
    window.speechSynthesis.speak(u);
  } catch { unlocked = false; }
}
