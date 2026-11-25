import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LatLng, PlanResult, Profile } from '../core/types';
import { ensureSession } from '../api';

export type Endpoint = LatLng & { label: string };
export type PlanState = { origin: Endpoint | null; destination: Endpoint | null; departure: string | null; plan: PlanResult | null };
type Ctx = PlanState & { set: (p: Partial<PlanState>) => void; profile: Profile | null; setProfile: (p: Profile) => void };

const KEY = 'gil-plan';
const Store = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlanState>(() => {
    try { const raw = sessionStorage.getItem(KEY); if (raw) return JSON.parse(raw) as PlanState; } catch { /* ignore */ }
    return { origin: null, destination: null, departure: null, plan: null };
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }, [state]);
  useEffect(() => { ensureSession().then(setProfile).catch(() => undefined); }, []);
  return <Store.Provider value={{ ...state, set: (p) => setState((s) => ({ ...s, ...p })), profile, setProfile }}>{children}</Store.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() { const c = useContext(Store); if (!c) throw new Error('useStore outside StoreProvider'); return c; }
