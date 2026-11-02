// [spec: UI-006]
import { h } from "preact";
import type { Task, Project, TaskStatus } from "../../../shared/types.js";
import { STATUS_LABELS } from "./types.js";

interface MobileActionSheetProps {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onUpdateStatus: (taskId: string, newStatus: TaskStatus) => void;
  onMoveTask?: (
    taskId: string,
    newStatus: TaskStatus,
    newProjectId: string | null,
  ) => void;
  onCompleteTask: (taskId: string) => void;
}

export function MobileActionSheet({
  task,
  projects,
  onClose,
  onUpdateStatus,
  onMoveTask,
  onCompleteTask,
}: MobileActionSheetProps) {
  if (!task) return null;

  return (
    <div
      data-testid="mobile-action-sheet"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#121718] border-t border-[#2A3235] rounded-t-2xl p-4 space-y-4 shadow-2xl animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2A3235] pb-2">
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-sm font-bold text-white truncate">
              {task.title}
            </h4>
            <p className="text-xs text-gray-400">
              Current: {STATUS_LABELS[task.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onCompleteTask(task.id);
              onClose();
            }}
            className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
          >
            ✓ Mark Done
          </button>
        </div>

        {/* Status Options */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Move to Column:</p>
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {(
              [
                "triage",
                "todo",
                "in_progress_today",
                "in_progress_week",
                "in_progress_month",
                "tracking",
              ] as const
            ).map((st) => (
              <button
                key={st}
                type="button"
                data-testid={`action-sheet-status-${st}`}
                onClick={() => {
                  if (onMoveTask) {
                    onMoveTask(task.id, st, task.project_id);
                  } else {
                    onUpdateStatus(task.id, st);
                  }
                  onClose();
                }}
                className={`p-2 rounded-lg text-xs font-medium text-center border transition-all ${
                  task.status === st
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold"
                    : "bg-[#1C2224] text-gray-300 border-[#2A3235] hover:border-gray-500"
                }`}
              >
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Reassign Project Pod */}
        {projects.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">
              Assign to Project Pod:
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (onMoveTask) {
                    onMoveTask(task.id, task.status, null);
                  }
                  onClose();
                }}
                className={`px-2 py-1 rounded-lg border text-xs whitespace-nowrap ${
                  task.project_id === null
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-semibold"
                    : "bg-[#1C2224] text-gray-300 border-[#2A3235]"
                }`}
              >
                ○ Unassigned
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (onMoveTask) {
                      onMoveTask(task.id, task.status, p.id);
                    }
                    onClose();
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs whitespace-nowrap ${
                    task.project_id === p.id
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 font-semibold"
                      : "bg-[#1C2224] text-gray-300 border-[#2A3235]"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
