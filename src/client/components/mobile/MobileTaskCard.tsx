// [spec: UI-006]
// [spec: UI-008]
// [spec: UI-010]
import { h } from "preact";
import {
  type Task,
  type Project,
  formatDisplayDateDMY,
  getTaskCardSurfaceClasses,
} from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { PRIORITY_STYLES, STATUS_LABELS } from "./types.js";

interface MobileTaskCardProps {
  task: Task;
  project?: Project | null;
  density: CardDensity;
  swipedTaskId: string | null;
  swipeOffset: number;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onOpenActionSheet: (task: Task) => void;
  onTouchStart: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchMove: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchEnd: (taskId: string) => void;
}

export function MobileTaskCard({
  task,
  project,
  density,
  swipedTaskId,
  swipeOffset,
  onSelectTask,
  onCompleteTask,
  onOpenActionSheet,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: MobileTaskCardProps) {
  const prio = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.week;
  const isMinimal = density === "minimal";
  const isSwipingThis = swipedTaskId === task.id;
  const currentOffset = isSwipingThis ? swipeOffset : 0;
  const isReadyToComplete = currentOffset >= 75;

  const cardContent = isMinimal ? (
    <div
      data-mobile-task-id={task.id}
      className={`rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors hover:border-gray-500 w-full ${getTaskCardSurfaceClasses(task.action_date)}`}
      style={{
        transform:
          currentOffset > 0 ? `translateX(${currentOffset}px)` : "none",
        transition: isSwipingThis ? "none" : "transform 0.2s ease-out",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          aria-label="Complete task"
          data-testid="complete-task-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCompleteTask(task.id);
          }}
          className="w-4 h-4 rounded-full border border-emerald-500/50 hover:bg-emerald-500/20 shrink-0"
        />
        <button
          type="button"
          onClick={() => onSelectTask(task)}
          className="text-left text-xs font-medium text-gray-100 truncate hover:text-emerald-400"
        >
          {task.title}
        </button>
        {task.created_by && (
          <span
            data-testid="creator-badge"
            className="text-[10px] px-1.5 py-0.2 rounded bg-[#121718] text-stone-300 border border-[#2A3235] truncate shrink-0"
            title={`Created by: ${task.created_by}`}
          >
            👤 {task.created_by}
          </span>
        )}
        {task.status === "tracking" && task.waiting_on && (
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate shrink-0">
            ⏳ {task.waiting_on}
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid="mobile-task-status-trigger"
        onClick={(e) => {
          e.stopPropagation();
          onOpenActionSheet(task);
        }}
        className="text-xs px-1.5 py-0.5 rounded bg-[#121718] text-emerald-400 border border-[#2A3235] shrink-0 font-medium hover:border-emerald-500/40"
      >
        {STATUS_LABELS[task.status]} ▾
      </button>
    </div>
  ) : (
    <div
      data-mobile-task-id={task.id}
      className={`rounded-xl border p-3 flex flex-col gap-2 transition-colors hover:border-gray-500 w-full ${getTaskCardSurfaceClasses(task.action_date)}`}
      style={{
        transform:
          currentOffset > 0 ? `translateX(${currentOffset}px)` : "none",
        transition: isSwipingThis ? "none" : "transform 0.2s ease-out",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            aria-label="Complete task"
            data-testid="complete-task-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCompleteTask(task.id);
            }}
            className="mt-0.5 w-4 h-4 rounded-full border border-emerald-500/50 hover:bg-emerald-500/20 shrink-0"
          />
          <button
            type="button"
            onClick={() => onSelectTask(task)}
            className="text-left text-xs font-semibold text-gray-100 leading-snug hover:text-emerald-400"
          >
            {task.title}
          </button>
        </div>
        <button
          type="button"
          data-testid="mobile-task-status-trigger"
          onClick={(e) => {
            e.stopPropagation();
            onOpenActionSheet(task);
          }}
          className="text-xs px-2 py-0.5 rounded-lg bg-[#121718] text-emerald-400 border border-emerald-500/30 shrink-0 font-medium hover:border-emerald-500"
        >
          {STATUS_LABELS[task.status]} ▾
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-gray-400">
        {project && (
          <span className="flex items-center gap-1 font-medium text-gray-300">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            {project.name}
          </span>
        )}
        <span className={`px-1.5 py-0.2 rounded border text-xs ${prio.badge}`}>
          {prio.label}
        </span>
        {task.action_date && (
          <span className="text-emerald-400 font-medium">
            ▶ {formatDisplayDateDMY(task.action_date)}
          </span>
        )}
        {task.due_date && (
          <span className="text-rose-400 font-medium">
            ⚑ {formatDisplayDateDMY(task.due_date)}
          </span>
        )}
        {task.created_by && (
          <span
            data-testid="creator-badge"
            className="text-[10px] px-1.5 py-0.2 rounded bg-[#121718] text-stone-300 border border-[#2A3235] truncate shrink-0"
            title={`Created by: ${task.created_by}`}
          >
            👤 {task.created_by}
          </span>
        )}
        {task.status === "tracking" && task.waiting_on && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            ⏳ {task.waiting_on}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div
      key={task.id}
      data-testid={`mobile-task-card-${task.id}`}
      className="relative overflow-hidden rounded-xl select-none"
      onTouchStart={(e) => onTouchStart(task.id, e)}
      onTouchMove={(e) => onTouchMove(task.id, e)}
      onTouchEnd={() => onTouchEnd(task.id)}
      onMouseDown={(e) => onTouchStart(task.id, e)}
      onMouseMove={(e) => onTouchMove(task.id, e)}
      onMouseUp={() => onTouchEnd(task.id)}
    >
      {/* Swipe Reveal Background */}
      <div
        className={`absolute inset-0 flex items-center px-4 rounded-xl font-bold text-xs pointer-events-none transition-colors ${
          isReadyToComplete
            ? "bg-emerald-500 text-black"
            : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm">✓</span> Done
        </span>
      </div>

      <div className="relative z-10 w-full">{cardContent}</div>
    </div>
  );
}
