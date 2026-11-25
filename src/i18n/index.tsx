import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../core/types';
import en, { type Dict } from './en';
import id from './id';
import ko from './ko';

const DICTS: Record<Lang, Dict> = { en, id, ko };
export type TKey = keyof Dict;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey, vars?: Record<string, string | number | null | undefined>) => string };
const I18n = createContext<Ctx | null>(null);

function initialLang(): Lang {
  try { const l = localStorage.getItem('lang'); if (l === 'en' || l === 'id' || l === 'ko') return l; } catch { /* ignore */ }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const value = useMemo<Ctx>(() => ({
    lang,
    setLang: (l) => { setLangState(l); try { localStorage.setItem('lang', l); } catch { /* ignore */ } document.documentElement.lang = l; },
    t: (k, vars) => (DICTS[lang][k] ?? en[k] ?? k).replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? '')),
  }), [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useT() { const c = useContext(I18n); if (!c) throw new Error('useT outside I18nProvider'); return c; }
