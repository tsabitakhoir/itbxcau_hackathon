// Voice guidance (audio mode for blind / low-vision users). Uses the browser's
// built-in speech synthesis only: no recording, no network, no AI.
import type { Lang } from '../core/types';

const VOICE_LANG: Record<Lang, string> = { en: 'en-US', id: 'id-ID', ko: 'ko-KR' };
export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, lang: Lang, interrupt = true) {
  if (!voiceSupported() || !text) return;
  const s = window.speechSynthesis;
  if (interrupt) s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE_LANG[lang]; u.rate = 0.95;
  const v = s.getVoices().find((x) => x.lang.toLowerCase().startsWith(VOICE_LANG[lang].slice(0, 2)));
  if (v) u.voice = v;
  s.speak(u);
}
export function stopSpeaking() { if (voiceSupported()) window.speechSynthesis.cancel(); }
