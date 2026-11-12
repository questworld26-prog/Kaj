// [spec: UI-004]
import { h } from "preact";
import {
  type Task,
  type Project,
  formatTimestampDMY,
} from "../../shared/types.js";

interface CompletedDrawerProps {
  isOpen: boolean;
  tasks: Task[];
  projects: Project[];
  onClose: () => void;
  onRestoreTask: (taskId: string) => void;
}

export function CompletedDrawer({
  isOpen,
  tasks,
  projects,
  onClose,
  onRestoreTask,
}: CompletedDrawerProps) {
  if (!isOpen) return null;

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      {/* Drawer Panel */}
      <aside
        data-testid="completed-archive-drawer"
        className="w-full max-w-md h-full bg-[#121718] border-l border-[#2A3235] shadow-2xl flex flex-col p-6 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2A3235]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              Completed Archive
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1C2224] text-emerald-400 border border-[#2A3235] font-semibold">
              {tasks.length}
            </span>
          </div>

          <button
            type="button"
            data-testid="close-archive-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1C2224] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="text-xs text-gray-400 my-3">
          Tasks completed and moved out of active Kanban swimlanes:
        </p>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-400 italic">
              No completed tasks archived yet.
            </div>
          ) : (
            tasks.map((task) => {
              const proj = task.project_id
                ? projectMap.get(task.project_id)
                : null;

              return (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  className="rounded-xl p-3.5 bg-[#1C2224] border border-[#2A3235] hover:border-gray-500 transition-colors flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-200 line-through decoration-emerald-500/60 leading-snug">
                      {task.title}
                    </span>

                    {proj && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded border"
                        style={{
                          backgroundColor: `${proj.color}15`,
                          color: proj.color,
                          borderColor: `${proj.color}40`,
                        }}
                      >
                        {proj.name}
                      </span>
                    )}
                  </div>

                  {task.details && (
                    <p className="text-[11px] text-gray-400 line-clamp-2">
                      {task.details}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#2A3235]/60 text-[10px] text-gray-400">
                    <span>
                      Done:{" "}
                      {task.completed_at
                        ? formatTimestampDMY(task.completed_at)
                        : "recently"}
                    </span>

                    <button
                      type="button"
                      data-testid="restore-task-btn"
                      onClick={() => onRestoreTask(task.id)}
                      className="flex items-center gap-1 font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                      Restore to Todo
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
