// [spec: UI-009]
export const PRIORITY_STYLES: Record<string, { label: string; badge: string }> =
  {
    today: {
      label: "Today",
      badge: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    },
    week: {
      label: "Week",
      badge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    },
    month: {
      label: "Month",
      badge: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    },
    quarter: {
      label: "Quarter",
      badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    },
    year: {
      label: "Year",
      badge: "bg-stone-500/10 text-stone-400 border-stone-500/30",
    },
  };

export function getISOWeekKey(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `W${String(weekNum).padStart(2, "0")}`;
}
