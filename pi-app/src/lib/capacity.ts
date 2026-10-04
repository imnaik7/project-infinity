import type { Member, Resource } from '../services/pi';

/** Total allocation % a person has across projects overlapping a date range. */
export function utilisation(members: Member[], resourceId: string, from: string, to: string): number {
  return members
    .filter((m) => m.resourceId === resourceId && m.active && (m.from ?? '0000') <= to && (m.to ?? '9999') >= from)
    .reduce((s, m) => s + m.allocation, 0);
}

/** % of requested skills a person has (case-insensitive, partial word match). */
export function skillMatch(r: Resource, wanted: string[]): number {
  const words = wanted.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return 0;
  const have = r.skills.map((s) => s.toLowerCase()).join(' | ');
  const hits = words.filter((w) => have.includes(w)).length;
  return Math.round((hits / words.length) * 100);
}

/** Allocation per week for the next N weeks (for heatmaps). */
export function weeklyLoad(members: Member[], resourceId: string, mondays: string[]): number[] {
  return mondays.map((mon) => {
    const end = new Date(new Date(`${mon}T00:00:00`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
    return utilisation(members, resourceId, mon, end);
  });
}
