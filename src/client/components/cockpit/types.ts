// [spec: UI-009]
// [spec: UI-012]
// [spec: UI-013]
// [spec: UI-014]
import {
  DEFAULT_DONE_RETENTION_DAYS,
  getISOYearWeekKey,
  getYearMonthKey,
  isoYearWeekToYearMonth,
  type Task,
  type TelemetrySummary,
} from "../../../shared/types.js";
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

const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function assignCreatorPalette(creators: Iterable<string>): {
  creatorList: string[];
  creatorStyleMap: Record<string, CreatorStackStyle>;
} {
  const creatorList = Array.from(creators);
  const creatorStyleMap: Record<string, CreatorStackStyle> = {};
  creatorList.forEach((creator, idx) => {
    creatorStyleMap[creator] = CREATOR_PALETTE[idx % CREATOR_PALETTE.length];
  });
  return { creatorList, creatorStyleMap };
}

function resolveTelemetryCreator(
  creator?: string | null,
  defaultCreatorName?: string | null,
): string {
  const cleaned = creator?.trim();
  const fallback = defaultCreatorName?.trim() || "Unspecified";
  if (!cleaned || cleaned === "Unspecified") {
    return fallback;
  }
  return cleaned;
}

/**
 * Aggregate completed tasks across the last 3 ISO weeks ordered newest-first
 * (current week on top), segmented by `created_by`.
 */
// [spec: UI-012]
export function buildCreatorStackData(
  completedTasks: ReadonlyArray<Pick<Task, "completed_at" | "created_by">>,
  now: Date = new Date(),
  defaultCreatorName?: string | null,
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
      const creator = resolveTelemetryCreator(t.created_by, defaultCreatorName);
      allCreators.add(creator);
      weekEntry.creators[creator] = (weekEntry.creators[creator] || 0) + 1;
      weekEntry.total += 1;
    }
  }

  const { creatorList, creatorStyleMap } = assignCreatorPalette(allCreators);

  return { weeks, creatorList, creatorStyleMap };
}

/**
 * Derive a TelemetrySummary solely from an in-memory array of tasks (e.g. search-filtered subset).
 */
// [spec: UI-013]
// [spec: UI-014]
export function buildTelemetrySummaryFromTasks(
  completedTasks: ReadonlyArray<
    Pick<Task, "completed_at" | "created_by" | "project_id">
  >,
  retentionDays: number = DEFAULT_DONE_RETENTION_DAYS,
  defaultCreatorName?: string | null,
): TelemetrySummary {
  const weekMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  const weekCreatorMap = new Map<string, number>();
  const monthCreatorMap = new Map<string, number>();

  for (const t of completedTasks) {
    const projectKey = t.project_id || "unassigned";
    projectMap.set(projectKey, (projectMap.get(projectKey) || 0) + 1);
    if (!t.completed_at) continue;
    const d = new Date(t.completed_at);
    if (isNaN(d.getTime())) continue;
    const isoWeek = getISOYearWeekKey(d);
    const yearMonth = getYearMonthKey(d);
    const creator = resolveTelemetryCreator(t.created_by, defaultCreatorName);
    weekMap.set(isoWeek, (weekMap.get(isoWeek) || 0) + 1);
    const wcKey = `${isoWeek}\0${creator}`;
    weekCreatorMap.set(wcKey, (weekCreatorMap.get(wcKey) || 0) + 1);
    const mcKey = `${yearMonth}\0${creator}`;
    monthCreatorMap.set(mcKey, (monthCreatorMap.get(mcKey) || 0) + 1);
  }

  return {
    retention_days: retentionDays,
    total_completed: completedTasks.length,
    live_completed: completedTasks.length,
    snapshotted_completed: 0,
    by_week: Array.from(weekMap.entries()).map(([iso_week, count]) => ({
      iso_week,
      count,
    })),
    by_project: Array.from(projectMap.entries()).map(([project_key, count]) => ({
      project_key,
      count,
    })),
    by_week_creator: Array.from(weekCreatorMap.entries()).map(([k, count]) => {
      const [iso_week, creator] = k.split("\0");
      return { iso_week, creator, count };
    }),
    by_month_creator: Array.from(monthCreatorMap.entries()).map(([k, count]) => {
      const [year_month, creator] = k.split("\0");
      return { year_month, creator, count };
    }),
  };
}

function buildCreatorStackWindowFromSummary(
  summary: TelemetrySummary,
  options: {
    now: Date;
    weekCount: number;
    newestFirst: boolean;
    tagCurrentLabel: boolean;
    defaultCreatorName?: string | null;
  },
): CreatorStackData {
  const { now, weekCount, newestFirst, tagCurrentLabel, defaultCreatorName } =
    options;
  const weeks: Array<CreatorWeekBucket & { yearWeek: string }> = [];

  for (let idx = 0; idx < weekCount; idx++) {
    const offsetWeeks = newestFirst ? idx : weekCount - 1 - idx;
    const d = new Date(now.getTime() - offsetWeeks * 7 * 24 * 60 * 60 * 1000);
    const yearWeek = getISOYearWeekKey(d);
    const weekKey = getISOWeekKey(d);
    const isCurrent = offsetWeeks === 0;
    weeks.push({
      yearWeek,
      weekKey,
      label: isCurrent && tagCurrentLabel ? `${weekKey} (Current)` : weekKey,
      isCurrent,
      total: 0,
      creators: {},
    });
  }

  const allCreators = new Set<string>();
  for (const entry of summary.by_week_creator) {
    const weekEntry = weeks.find((w) => w.yearWeek === entry.iso_week);
    if (weekEntry && entry.count > 0) {
      const creator = resolveTelemetryCreator(entry.creator, defaultCreatorName);
      allCreators.add(creator);
      weekEntry.creators[creator] =
        (weekEntry.creators[creator] || 0) + entry.count;
      weekEntry.total += entry.count;
    }
  }

  const { creatorList, creatorStyleMap } = assignCreatorPalette(allCreators);

  return {
    weeks: weeks.map(({ yearWeek: _yw, ...bucket }) => bucket),
    creatorList,
    creatorStyleMap,
  };
}

/**
 * Build last-3-week stacked creator telemetry from merged TelemetrySummary (live + snapshots).
 */
// [spec: UI-013]
export function buildCreatorStackDataFromSummary(
  summary: TelemetrySummary,
  now: Date = new Date(),
  defaultCreatorName?: string | null,
): CreatorStackData {
  return buildCreatorStackWindowFromSummary(summary, {
    now,
    weekCount: 3,
    newestFirst: true,
    tagCurrentLabel: true,
    defaultCreatorName,
  });
}

/**
 * Build last-6-week chronological stacked weekly velocity telemetry from merged TelemetrySummary.
 */
// [spec: UI-009]
// [spec: UI-013]
export function buildWeeklyVelocityStackFromSummary(
  summary: TelemetrySummary,
  now: Date = new Date(),
  defaultCreatorName?: string | null,
): CreatorStackData {
  return buildCreatorStackWindowFromSummary(summary, {
    now,
    weekCount: 6,
    newestFirst: false,
    tagCurrentLabel: false,
    defaultCreatorName,
  });
}

/**
 * Build last-6-month chronological stacked monthly velocity telemetry from merged TelemetrySummary.
 */
// [spec: UI-014]
export function buildMonthlyVelocityStackFromSummary(
  summary: TelemetrySummary,
  now: Date = new Date(),
  defaultCreatorName?: string | null,
): CreatorStackData {
  const monthCount = 6;
  const buckets: CreatorWeekBucket[] = [];
  for (let offset = monthCount - 1; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1, 12, 0, 0);
    const yearMonth = getYearMonthKey(d);
    buckets.push({
      weekKey: yearMonth,
      label: MONTH_SHORT_NAMES[d.getMonth()],
      isCurrent: offset === 0,
      total: 0,
      creators: {},
    });
  }

  const entries =
    summary.by_month_creator ??
    summary.by_week_creator.flatMap((entry) => {
      const yearMonth = isoYearWeekToYearMonth(entry.iso_week);
      return yearMonth
        ? [{ year_month: yearMonth, creator: entry.creator, count: entry.count }]
        : [];
    });

  const allCreators = new Set<string>();
  for (const entry of entries) {
    if (entry.count <= 0) continue;
    const bucket = buckets.find((m) => m.weekKey === entry.year_month);
    if (!bucket) continue;
    const creator = resolveTelemetryCreator(entry.creator, defaultCreatorName);
    allCreators.add(creator);
    bucket.creators[creator] = (bucket.creators[creator] || 0) + entry.count;
    bucket.total += entry.count;
  }

  const { creatorList, creatorStyleMap } = assignCreatorPalette(allCreators);
  return { weeks: buckets, creatorList, creatorStyleMap };
}
