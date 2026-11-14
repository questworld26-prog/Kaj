// [spec: TASK-002]
// [spec: PROJ-001]
import { z } from "zod";

export const TASK_STATUSES = [
  "triage",
  "todo",
  "in_progress_today",
  "in_progress_week",
  "in_progress_month",
  "tracking",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = [
  "today",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type PriorityHorizon = TaskPriority;

export const REPEAT_RULES = ["none", "weekly", "monthly", "yearly"] as const;

export type RepeatRule = (typeof REPEAT_RULES)[number];
export type RecurrenceRule = RepeatRule;


export const RepeatDayOfWeekSchema = z.number().int().min(0).max(6).nullable();
export const RepeatDayOfMonthSchema = z
  .number()
  .int()
  .min(1)
  .max(31)
  .nullable();
export const RepeatDayOfYearSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Must be in MM-DD format")
  .nullable();

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format")
  .refine((val) => {
    const [y, m, d] = val.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "Invalid calendar date (e.g. leap year or non-existent day)")
  .nullable();

/**
 * Formats an ISO YYYY-MM-DD date string to DD-MM-YYYY display format.
 */
export function formatDisplayDateDMY(
  dateStr: string | null | undefined,
): string {
  if (!dateStr) return "";
  const parts = dateStr.trim().split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }
  return dateStr;
}

/**
 * Formats an ISO timestamp or date string to DD-MM-YYYY display format.
 */
export function formatTimestampDMY(
  timestampStr: string | null | undefined,
): string {
  if (!timestampStr) return "";
  try {
    const d = new Date(timestampStr);
    if (isNaN(d.getTime())) return timestampStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return timestampStr;
  }
}

export const CreateTaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title cannot be empty or only whitespace"),
  status: z.enum(TASK_STATUSES).default("triage"),
  details: z.string().default(""),
  project_id: z.string().nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default("week"),
  action_date: DateStringSchema.default(null),
  due_date: DateStringSchema.default(null),
  repeat_rule: z.enum(REPEAT_RULES).default("none"),
  repeat_day_of_week: RepeatDayOfWeekSchema.optional().default(null),
  repeat_day_of_month: RepeatDayOfMonthSchema.optional().default(null),
  repeat_day_of_year: RepeatDayOfYearSchema.optional().default(null),
  waiting_on: z.string().default(""),
  created_by: z.string().nullable().optional().default(null),
  sort_order: z.number().optional(),
});

export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title cannot be empty or only whitespace")
    .optional(),
  status: z.enum(TASK_STATUSES).optional(),
  details: z.string().optional(),
  project_id: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  action_date: DateStringSchema.optional(),
  due_date: DateStringSchema.optional(),
  repeat_rule: z.enum(REPEAT_RULES).optional(),
  repeat_day_of_week: RepeatDayOfWeekSchema.optional(),
  repeat_day_of_month: RepeatDayOfMonthSchema.optional(),
  repeat_day_of_year: RepeatDayOfYearSchema.optional(),
  waiting_on: z.string().optional(),
  created_by: z.string().nullable().optional(),
  sort_order: z.number().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  details: string;
  project_id: string | null;
  priority: TaskPriority;
  action_date: string | null;
  due_date: string | null;
  repeat_rule: RepeatRule;
  repeat_day_of_week: number | null;
  repeat_day_of_month: number | null;
  repeat_day_of_year: string | null;
  waiting_on: string;
  sort_order: number;
  completed_at: string | null;
  deleted_at: string | null;
  parent_recurring_id: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const CreateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name cannot be empty or only whitespace"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color code, e.g. #10B981")
    .default("#10B981"),
  sort_order: z.number().int().optional(),
});

export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sort_order: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export interface Project {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface SwimlaneGroup {
  swimlane_id: string;
  project: Project | null;
  tasks: Task[];
}


export interface CalendarEvent {
  task_id: string;
  title: string;
  status: TaskStatus;
  project_id: string | null;
  priority: TaskPriority;
  date: string;
  date_type: "action" | "due";
  is_virtual?: boolean;
}

/**
 * Format local wall-clock calendar date as `YYYY-MM-DD`.
 */
// [spec: TASK-008]
// [spec: UI-010]
export function formatLocalDateYMD(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Check whether a task's action_date matches today's local calendar date.
 */
// [spec: TASK-008]
// [spec: UI-010]
export function isActionDateToday(
  actionDate: string | null | undefined,
  todayStr?: string,
): boolean {
  if (!actionDate) return false;
  return actionDate === (todayStr || formatLocalDateYMD());
}

/**
 * Compute the Monday (`YYYY-MM-DD`) starting the Monday-to-Sunday calendar week containing `dateStr`.
 */
// [spec: TASK-009]
export function getMondayWeekStartYMD(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  const my = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const md = String(dt.getUTCDate()).padStart(2, "0");
  return `${my}-${mm}-${md}`;
}

/**
 * Check whether `dateStr` (`YYYY-MM-DD`) falls within the current Monday-to-Sunday week.
 */
// [spec: TASK-009]
export function isDateInCurrentMondayWeek(
  dateStr: string | null | undefined,
  todayStr?: string,
): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return (
    getMondayWeekStartYMD(dateStr) ===
    getMondayWeekStartYMD(todayStr || formatLocalDateYMD())
  );
}

/**
 * Compute Chronos dark-mode card background and border classes, switching to high-visibility crimson when action_date is today.
 */
// [spec: UI-010]
export function getTaskCardSurfaceClasses(
  actionDate: string | null | undefined,
  normalBorderClass = "border-[#2A3235]",
): string {
  return isActionDateToday(actionDate)
    ? "bg-[#4A1215] border-red-500/70"
    : `bg-[#1C2224] ${normalBorderClass}`;
}

export const HIDE_REPEATING_TRIAGE_STORAGE_KEY = "kaj_hide_repeating_triage";

/**
 * Determine whether a task should be visible in Board/Triage/Pods surfaces when
 * hiding recurring triage items globally across all projects and unassigned inbox.
 */
// [spec: UI-011]
export function shouldShowTaskInBoardOrTriage(
  task: Pick<Task, "status" | "repeat_rule"> & { project_id?: string | null },
  hideRepeatingTriage: boolean,
): boolean {
  if (!hideRepeatingTriage) return true;
  return !(task.status === "triage" && task.repeat_rule !== "none");
}

export const DEFAULT_DONE_RETENTION_DAYS = 90;

/**
 * Parse KAJ_DONE_RETENTION_DAYS: defaults to 90 days when unset/blank,
 * allows 0 / "off" / "disabled" to disable retention purging.
 */
// [spec: TASK-010]
export function parseDoneRetentionDays(raw?: string | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_DONE_RETENTION_DAYS;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "0" || normalized === "off" || normalized === "disabled" || normalized === "false") {
    return 0;
  }
  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_DONE_RETENTION_DAYS;
}

/**
 * Format an ISO year-week key (`YYYY-Www`) using Monday-to-Sunday ISO week numbering.
 */
// [spec: TASK-010]
export function getISOYearWeekKey(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const isoYear = target.getFullYear();
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

export interface TelemetryWeekEntry {
  iso_week: string;
  count: number;
}

export interface TelemetryProjectEntry {
  project_key: string;
  count: number;
}

export interface TelemetryWeekCreatorEntry {
  iso_week: string;
  creator: string;
  count: number;
}

export interface TelemetrySummary {
  retention_days: number;
  total_completed: number;
  live_completed: number;
  snapshotted_completed: number;
  by_week: TelemetryWeekEntry[];
  by_project: TelemetryProjectEntry[];
  by_week_creator: TelemetryWeekCreatorEntry[];
}

export interface PurgeCompletedResult {
  retention_days: number;
  purged_count: number;
  snapshotted_count: number;
  cutoff_iso: string | null;
}
