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
