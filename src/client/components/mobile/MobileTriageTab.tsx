// [spec: UI-006]
// [spec: UI-008]
import { h } from "preact";
import { useState } from "preact/hooks";
import type { Task, Project } from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { MobileTaskCard } from "./MobileTaskCard.js";

interface MobileTriageTabProps {
  tasks: Task[];
  completedTasks: Task[];
  projectMap: Map<string, Project>;
  density: CardDensity;
  swipedTaskId: string | null;
  swipeOffset: number;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onRestoreTask: (taskId: string) => void;
  onOpenActionSheet: (task: Task) => void;
  onTouchStart: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchMove: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchEnd: (taskId: string) => void;
}

export function MobileTriageTab({
  tasks,
  completedTasks,
  projectMap,
  density,
  swipedTaskId,
  swipeOffset,
  onSelectTask,
  onCompleteTask,
  onRestoreTask,
  onOpenActionSheet,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: MobileTriageTabProps) {
  const [triageSubTab, setTriageSubTab] = useState<"queue" | "archive">(
    "queue",
  );

  const renderCard = (task: Task) => (
    <MobileTaskCard
      key={task.id}
      task={task}
      project={task.project_id ? projectMap.get(task.project_id) : null}
      density={density}
      swipedTaskId={swipedTaskId}
      swipeOffset={swipeOffset}
      onSelectTask={onSelectTask}
      onCompleteTask={onCompleteTask}
      onOpenActionSheet={onOpenActionSheet}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );

  const queueTasks = tasks.filter(
    (t) => t.status === "triage" || t.status === "todo",
  );

  return (
    <div
      data-testid="mobile-triage-view"
      className="flex-1 p-3 space-y-3 overflow-y-auto"
    >
      {/* Segmented Switcher */}
      <div className="grid grid-cols-2 gap-1 bg-[#121718] p-1 rounded-xl border border-[#2A3235]">
        <button
          type="button"
          onClick={() => setTriageSubTab("queue")}
          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
            triageSubTab === "queue"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-gray-400 hover:text-white"
          }`}
        >
          📥 Triage / Todo ({queueTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setTriageSubTab("archive")}
          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
            triageSubTab === "archive"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-gray-400 hover:text-white"
          }`}
        >
          ✓ Completed ({completedTasks.length})
        </button>
      </div>

      {triageSubTab === "queue" ? (
        <div className="space-y-2">
          {queueTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-6 text-center">
              Inbox zero! No tasks awaiting triage or todo.
            </div>
          ) : (
            queueTasks.map((task) => renderCard(task))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {completedTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-6 text-center">
              No completed tasks archived yet.
            </div>
          ) : (
            completedTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl bg-[#1C2224] border border-[#2A3235] p-3 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-gray-400 line-through truncate leading-snug">
                  {task.title}
                </span>
                <button
                  type="button"
                  onClick={() => onRestoreTask(task.id)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 shrink-0"
                >
                  ↺ Restore
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
