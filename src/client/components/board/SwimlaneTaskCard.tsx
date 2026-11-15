// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-005]
// [spec: UI-010]
// [spec: TASK-006]
import { h } from "preact";
import {
  type Task,
  formatDisplayDateDMY,
  isActionDateToday,
} from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";

const PRIORITY_STYLES: Record<string, { label: string; badge: string }> = {
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

function priorityDotColor(priority: string): string {
  switch (priority) {
    case "today":
      return "bg-rose-500";
    case "week":
      return "bg-amber-500";
    case "month":
      return "bg-sky-500";
    case "quarter":
      return "bg-indigo-500";
    default:
      return "bg-stone-500";
  }
}

function CompleteTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="complete-task-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Mark complete"
      className="w-4 h-4 rounded-full border border-gray-500 hover:border-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center text-transparent hover:text-emerald-400 transition-all shrink-0"
    >
      <svg
        className="w-2.5 h-2.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          d="M5 13l4 4L19 7"
        />
      </svg>
    </button>
  );
}

interface SwimlaneTaskCardProps {
  task: Task;
  density: CardDensity;
  isTracking: boolean;
  isDraggedOver: boolean;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onDragOverCard: (taskId: string, e: DragEvent) => void;
  onDragLeaveCard: (taskId: string, e: DragEvent) => void;
  onDropCard: (taskId: string, e: DragEvent) => void;
}

export function SwimlaneTaskCard({
  task,
  density,
  isTracking,
  isDraggedOver,
  onSelectTask,
  onCompleteTask,
  onDragOverCard,
  onDragLeaveCard,
  onDropCard,
}: SwimlaneTaskCardProps) {
  const priStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.week;
  const isUrgentToday = isActionDateToday(task.action_date);
  const cardBgClass = isUrgentToday ? "bg-[#4A1215]" : "bg-[#1C2224]";
  const cardBorderClass = isUrgentToday
    ? "border border-red-500/70"
    : "border border-[#2A3235]";
  const frameBorderClass = isDraggedOver
    ? "ring-2 ring-emerald-400 border-emerald-400 shadow-md"
    : isTracking
      ? "border-2 border-dashed border-amber-500/60"
      : cardBorderClass;

  const handleDragStart = (e: DragEvent) => {
    const payload = JSON.stringify({
      taskId: task.id,
      sourceStatus: task.status,
      sourceProjectId: task.project_id,
    });
    e.dataTransfer?.setData("application/kaj-task", payload);
    e.dataTransfer?.setData("text/plain", payload);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };

  const handleCardClick = (e: MouseEvent) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) return;
    onSelectTask(task);
  };

  if (density === "minimal") {
    return (
      <article
        data-testid="task-card"
        data-task-id={task.id}
        data-urgent-today={isUrgentToday ? "true" : undefined}
        draggable={true}
        onDragStart={handleDragStart}
        onDragOver={(e) => onDragOverCard(task.id, e)}
        onDragLeave={(e) => onDragLeaveCard(task.id, e)}
        onDrop={(e) => onDropCard(task.id, e)}
        className={`group relative rounded-lg py-1 px-2.5 ${cardBgClass} transition-all hover:border-gray-500 hover:shadow-sm cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 h-9 min-h-[36px] max-h-[38px] ${frameBorderClass}`}
        onClick={handleCardClick}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <CompleteTaskButton onClick={() => onCompleteTask(task.id)} />
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${priorityDotColor(task.priority)}`}
            title={`Priority: ${task.priority}`}
          />
          <span
            className="text-xs font-medium text-gray-100 truncate"
            title={task.title}
          >
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
          {task.created_by && (
            <span
              data-testid="creator-badge"
              className="text-stone-400 font-normal truncate max-w-[80px]"
              title={`Created by: ${task.created_by}`}
            >
              👤 {task.created_by}
            </span>
          )}
          {task.repeat_rule !== "none" && (
            <span
              className="text-emerald-400"
              title={`Repeats ${task.repeat_rule}`}
            >
              ↻
            </span>
          )}
          {task.due_date && (
            <span className="text-rose-400 font-medium">
              ⚑ {formatDisplayDateDMY(task.due_date)}
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      data-testid="task-card"
      data-task-id={task.id}
      data-urgent-today={isUrgentToday ? "true" : undefined}
      draggable={true}
      onDragStart={handleDragStart}
      onDragOver={(e) => onDragOverCard(task.id, e)}
      onDragLeave={(e) => onDragLeaveCard(task.id, e)}
      onDrop={(e) => onDropCard(task.id, e)}
      className={`group relative rounded-xl p-2.5 ${cardBgClass} transition-all hover:border-gray-500 hover:shadow-md cursor-grab active:cursor-grabbing ${
        isDraggedOver
          ? "ring-2 ring-emerald-400 border-emerald-400 shadow-md"
          : isTracking
            ? "border-2 border-dashed border-amber-500/60 shadow-amber-950/20"
            : cardBorderClass
      }`}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5">
          <CompleteTaskButton onClick={() => onCompleteTask(task.id)} />
          <span
            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${priStyle.badge}`}
          >
            {priStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {task.created_by && (
            <span
              data-testid="creator-badge"
              title={`Created by: ${task.created_by}`}
              className="text-[9px] px-1 py-0.2 rounded bg-[#161B1C] text-stone-300 border border-[#2A3235] truncate max-w-[90px]"
            >
              👤 {task.created_by}
            </span>
          )}
          {task.repeat_rule !== "none" && (
            <span
              title={`Recurring: ${task.repeat_rule}`}
              className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            >
              ↻
            </span>
          )}
        </div>
      </div>

      <h4
        className="text-xs font-semibold text-gray-100 truncate mb-1 leading-snug"
        title={task.title}
      >
        {task.title}
      </h4>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
        {task.action_date && (
          <span className="flex items-center gap-0.5 text-emerald-400 font-medium">
            <span>▶</span> {formatDisplayDateDMY(task.action_date)}
          </span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-rose-400 font-medium">
            <span>⚑</span> {formatDisplayDateDMY(task.due_date)}
          </span>
        )}
        {isTracking && task.waiting_on && (
          <span
            data-testid="blocker-badge"
            className="truncate max-w-[140px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px]"
          >
            {task.waiting_on}
          </span>
        )}
      </div>
    </article>
  );
}
