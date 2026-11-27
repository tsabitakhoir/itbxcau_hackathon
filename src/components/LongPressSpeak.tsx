// Voice guidance, part 2: while it is on, pressing and holding any element reads its text aloud
// (browser speech synthesis only). A normal tap still works as usual.
import { useEffect } from 'react';
import { useStore } from '../state/store';
import { useT } from '../i18n';
import { speak, stopSpeaking, unlockVoice } from './voice';

const HOLD_MS = 550; const MOVE_PX = 10;
const SPEAKABLE = '[aria-label], button, a, label, h1, h2, h3, h4, p, li, summary, [role="option"], [role="dialog"]';

function textOf(start: Element): string {
  const el = start.closest(SPEAKABLE) ?? start;
  const input = el.querySelector?.('input, textarea, select') as HTMLInputElement | null;
  const parts = [el.getAttribute('aria-label'), (el as HTMLElement).innerText?.trim()];
  if (input && !(el as HTMLElement).innerText?.trim()) parts.push(input.placeholder, input.value);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.getAttribute('aria-label') ?? '', el.value, el.placeholder);
  const text = parts.find((x) => x && x.trim());
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

export function LongPressSpeak() {
  const { prefs } = useStore(); const { lang } = useT();
  // Unlock speech on the first tap/key press of the visit, whatever the voice setting is, so that
  // turning voice on (or having it on by default) works at once without an off/on toggle.
  useEffect(() => {
    const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
    const once = () => { unlockVoice(); events.forEach((e) => document.removeEventListener(e, once, true)); };
    events.forEach((e) => document.addEventListener(e, once, true));
    return () => events.forEach((e) => document.removeEventListener(e, once, true));
  }, []);
  useEffect(() => {
    if (!prefs.voice) return;
    let timer = 0; let x0 = 0; let y0 = 0; let fired = false;
    const clear = () => { window.clearTimeout(timer); timer = 0; };
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest('[data-no-speak]')) return;
      fired = false; x0 = e.clientX; y0 = e.clientY; const target = e.target; clear();
      timer = window.setTimeout(() => { const text = textOf(target); if (text) { fired = true; speak(text, lang); } }, HOLD_MS);
    };
    const move = (e: PointerEvent) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_PX) clear(); };
    // The release after a spoken long-press must not also act as a tap.
    const click = (e: MouseEvent) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } };
    const menu = (e: Event) => { if (fired) e.preventDefault(); };
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', clear, true); document.addEventListener('pointercancel', clear, true);
    document.addEventListener('click', click, true); document.addEventListener('contextmenu', menu, true);
    return () => {
      clear(); stopSpeaking();
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', clear, true); document.removeEventListener('pointercancel', clear, true);
      document.removeEventListener('click', click, true); document.removeEventListener('contextmenu', menu, true);
    };
  }, [prefs.voice, lang]);
  return null;
}
