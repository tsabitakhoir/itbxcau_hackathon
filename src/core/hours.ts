// Opening hours, evaluated at the departure time (Temporal Data).
// Supports the contract format ("24/7", "HH:MM-HH:MM", null) and the common subset of OSM opening_hours:
// "Mo-Fr 08:00-17:00; Sa 08:00-12:00", "Mo-Su 07:00-22:00,23:00-02:00", "Su off", "24/7".
// Returns true / false, or null when the value is missing or not understood.

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

function parseDays(spec: string): Set<number> | null {
  const set = new Set<number>();
  for (const part of spec.toLowerCase().split(',')) {
    const p = part.trim();
    if (p === 'ph') continue; // public holidays: ignore
    const m = p.match(/^([a-z]{2})(?:-([a-z]{2}))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]); const b = m[2] ? DAYS.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return null;
    for (let d = a; ; d = (d + 1) % 7) { set.add(d); if (d === b) break; }
  }
  return set;
}

const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };

/** Is minute-of-week inside "HH:MM-HH:MM" that starts on `day`? Handles ranges past midnight. */
function inRange(range: string, day: number, nowDay: number, nowMin: number): boolean | null {
  const m = range.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/);
  if (!m) return null;
  const a = toMin(m[1]); let b = toMin(m[2]);
  if (b <= a) b += 24 * 60; // over midnight (and 00:00-24:00)
  const start = day * 1440 + a, end = day * 1440 + b;
  const now = nowDay * 1440 + nowMin;
  // check this week and the wrap from Saturday night into Sunday
  return (now >= start && now < end) || (now + 7 * 1440 >= start && now + 7 * 1440 < end);
}

export function isOpenAt(hours: string | null | undefined, t: Date): boolean | null {
  if (hours == null) return null;
  const h = hours.trim();
  if (!h) return null;
  if (h === '24/7' || /^mo-su 00:00-24:00$/i.test(h)) return true;
  const nowDay = t.getDay(), nowMin = t.getHours() * 60 + t.getMinutes();
  let understood = false;
  let open = false;
  for (const rule of h.split(';')) {
    const r = rule.trim();
    if (!r) continue;
    const m = r.match(/^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?)(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)?\s*(.*)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, '')) : new Set([0, 1, 2, 3, 4, 5, 6]);
    const times = m[2].trim();
    if (!days) return null;
    if (/^(off|closed)$/i.test(times)) {
      // later rules override earlier ones (OSM semantics); "off" closes those days
      if (days.has(nowDay)) open = false;
      understood = true;
      continue;
    }
    if (times === '24/7' || times === '00:00-24:00') { if (days.has(nowDay)) open = true; understood = true; continue; }
    let ruleOpen = false;
    for (const range of times.split(',')) {
      for (const d of days) {
        const r2 = inRange(range, d, nowDay, nowMin);
        if (r2 === null) return null;
        if (r2) ruleOpen = true;
      }
    }
    understood = true;
    // a rule for today's weekday replaces earlier rules for today
    if (days.has(nowDay) || ruleOpen) open = ruleOpen || (open && !days.has(nowDay));
  }
  return understood ? open : null;
}
