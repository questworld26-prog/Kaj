// [spec: UI-003]
import { h } from "preact";
import type { Task } from "../../../shared/types.js";

interface UnscheduledSidebarProps {
  unscheduledTasks: Task[];
  todayStr: string;
  onSelectTask: (task: Task) => void;
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void;
}

export function UnscheduledSidebar({
  unscheduledTasks,
  todayStr,
  onSelectTask,
  onScheduleTask,
}: UnscheduledSidebarProps) {
  return (
    <aside
      data-testid="unscheduled-sidebar"
      className="w-full lg:w-80 flex flex-col bg-[#121718] rounded-2xl border border-[#2A3235] p-5 shadow-lg shadow-black/40"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#2A3235]">
        <h4 className="text-sm font-bold text-white">Unscheduled Tasks</h4>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1C2224] text-gray-300 border border-[#2A3235] font-semibold">
          {unscheduledTasks.length}
        </span>
      </div>

      <p className="text-[11px] text-gray-400 my-3">
        Tasks missing an action date. Schedule them directly onto the calendar:
      </p>

      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[600px]">
        {unscheduledTasks.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400 italic">
            All active tasks are scheduled!
          </div>
        ) : (
          unscheduledTasks.map((t) => (
            <div
              key={t.id}
              data-task-id={t.id}
              draggable={true}
              onDragStart={(e) => {
                const payload = JSON.stringify({
                  taskId: t.id,
                  type: "action",
                });
                e.dataTransfer?.setData("application/kaj-task", payload);
                e.dataTransfer?.setData("text/plain", payload);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
              }}
              className="rounded-xl p-3 bg-[#1C2224] border border-[#2A3235] hover:border-gray-500 transition-colors flex flex-col gap-2 cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-semibold text-gray-200 leading-snug">
                  {t.title}
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {t.priority}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  data-testid="schedule-today-btn"
                  onClick={() => onScheduleTask(t.id, todayStr)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                >
                  <span>▶</span> Schedule Today
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTask(t)}
                  className="text-[11px] text-gray-400 hover:text-gray-200"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
