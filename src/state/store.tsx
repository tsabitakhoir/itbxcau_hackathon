import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LatLng, PlanResult, Profile, TravelMode } from '../core/types';
import { ensureSession, updateProfile } from '../api';

export type Endpoint = LatLng & { label: string };
export type PlanState = { origin: Endpoint | null; destination: Endpoint | null; departure: string | null; plan: PlanResult | null };
/** Travel preferences from C-00 / Home "Travel settings". Kept on the device and mirrored to the profile. */
export type Prefs = { mode: TravelMode; voice: boolean; chosen: boolean };
type Ctx = PlanState & {
  set: (p: Partial<PlanState>) => void; profile: Profile | null; setProfile: (p: Profile) => void;
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
};

const KEY = 'gil-plan';
const PREFS = 'gil-prefs';
const Store = createContext<Ctx | null>(null);

function loadPrefs(): Prefs {
  try { const raw = localStorage.getItem(PREFS); if (raw) return { mode: 'walk', voice: true, chosen: false, ...JSON.parse(raw) as Partial<Prefs> }; } catch { /* ignore */ }
  return { mode: 'walk', voice: true, chosen: false }; // voice guidance is on from the first launch
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlanState>(() => {
    try { const raw = sessionStorage.getItem(KEY); if (raw) return JSON.parse(raw) as PlanState; } catch { /* ignore */ }
    return { origin: null, destination: null, departure: null, plan: null };
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }, [state]);
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);
  useEffect(() => { ensureSession().then(setProfile).catch(() => undefined); }, []);
  const setPrefs = (p: Partial<Prefs>) => {
    setPrefsState((s) => {
      const next = { ...s, ...p };
      // A new travel mode makes the cached plan stale.
      if (p.mode && p.mode !== s.mode) setState((st) => ({ ...st, plan: null }));
      updateProfile({ travel_mode: next.mode, voice_guidance: next.voice }).then(setProfile).catch(() => undefined);
      return next;
    });
  };
  return <Store.Provider value={{ ...state, set: (p) => setState((s) => ({ ...s, ...p })), profile, setProfile, prefs, setPrefs }}>{children}</Store.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() { const c = useContext(Store); if (!c) throw new Error('useStore outside StoreProvider'); return c; }
