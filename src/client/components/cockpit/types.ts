// [spec: UI-009]
// [spec: UI-012]
import type { Task } from "../../../shared/types.js";
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

export interface CreatorStackStyle {
  bg: string;
  text: string;
}

export interface CreatorWeekBucket {
  weekKey: string;
  label: string;
  isCurrent: boolean;
  total: number;
  creators: Record<string, number>;
}

export interface CreatorStackData {
  weeks: CreatorWeekBucket[];
  creatorList: string[];
  creatorStyleMap: Record<string, CreatorStackStyle>;
}

export const CREATOR_PALETTE: ReadonlyArray<CreatorStackStyle> = [
  { bg: "#10B981", text: "#091310" }, // Emerald 500 (>7.3:1 contrast)
  { bg: "#38BDF8", text: "#091310" }, // Sky 400 (>8.9:1 contrast)
  { bg: "#F59E0B", text: "#091310" }, // Amber 500 (>8.2:1 contrast)
  { bg: "#C084FC", text: "#091310" }, // Purple 400 (>7.0:1 contrast)
  { bg: "#F472B6", text: "#091310" }, // Pink 400 (>6.8:1 contrast)
  { bg: "#94A3B8", text: "#091310" }, // Slate 400 (>7.1:1 contrast)
];

/**
 * Aggregate completed tasks across the last 3 ISO weeks ordered newest-first
 * (current week on top), segmented by `created_by`.
 */
// [spec: UI-012]
export function buildCreatorStackData(
  completedTasks: ReadonlyArray<Pick<Task, "completed_at" | "created_by">>,
  now: Date = new Date(),
): CreatorStackData {
  const weeks: CreatorWeekBucket[] = [];

  for (let i = 0; i <= 2; i++) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekKey = getISOWeekKey(d);
    weeks.push({
      weekKey,
      label: i === 0 ? `${weekKey} (Current)` : weekKey,
      isCurrent: i === 0,
      total: 0,
      creators: {},
    });
  }

  const allCreators = new Set<string>();

  for (const t of completedTasks) {
    if (!t.completed_at) continue;
    const compDate = new Date(t.completed_at);
    const wKey = getISOWeekKey(compDate);
    const weekEntry = weeks.find((w) => w.weekKey === wKey);
    if (weekEntry) {
      const creator = t.created_by?.trim() || "Unspecified";
      allCreators.add(creator);
      weekEntry.creators[creator] = (weekEntry.creators[creator] || 0) + 1;
      weekEntry.total += 1;
    }
  }

  const creatorList = Array.from(allCreators);
  const creatorStyleMap: Record<string, CreatorStackStyle> = {};
  creatorList.forEach((creator, idx) => {
    creatorStyleMap[creator] = CREATOR_PALETTE[idx % CREATOR_PALETTE.length];
  });

  return { weeks, creatorList, creatorStyleMap };
}
