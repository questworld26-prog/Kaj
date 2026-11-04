// [spec: UI-006]
// [spec: UI-008]
import type { TaskStatus } from "../../../shared/types.js";

export type MobileTab = "cockpit" | "pods" | "calendar" | "triage";

export function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

export const STATUS_LABELS: Record<TaskStatus, string> = {
  triage: "Triage",
  todo: "Todo",
  in_progress_today: "⚡ Today",
  in_progress_week: "📅 Week",
  in_progress_month: "🗓 Month",
  tracking: "⏳ Tracking",
  done: "✓ Done",
};
