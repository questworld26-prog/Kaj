// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-005]
// [spec: UI-010]
// [spec: UI-011]
// [spec: TASK-006]
import { h } from "preact";
import { useState } from "preact/hooks";
import type { Task, SwimlaneGroup, TaskStatus } from "../../shared/types.js";
import type { CardDensity } from "./TopBar.js";
import { RepeatingTriageToggle } from "./RepeatingTriageToggle.js";
import { SwimlaneColumn } from "./board/SwimlaneColumn.js";

interface SwimlaneBoardProps {
  swimlanes: SwimlaneGroup[];
  density?: CardDensity;
  hideRepeatingTriage?: boolean;
  hiddenRepeatingTriageCount?: number;
  onToggleHideRepeatingTriage?: () => void;
  onSelectTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onMoveTask?: (
    taskId: string,
    newStatus: TaskStatus,
    newProjectId: string | null,
  ) => void;
  onCompleteTask: (taskId: string) => void;
  onReorderTasks?: (taskIds: string[]) => void;
  onReorderProject?: (projectId: string, direction: "up" | "down") => void;
  onCreateTaskInColumn?: (status: TaskStatus, projectId: string | null) => void;
}

export function SwimlaneBoard({
  swimlanes,
  density = "compact",
  hideRepeatingTriage = false,
  hiddenRepeatingTriageCount = 0,
  onToggleHideRepeatingTriage,
  onSelectTask,
  onUpdateTaskStatus,
  onMoveTask,
  onCompleteTask,
  onReorderTasks,
  onCreateTaskInColumn,
}: SwimlaneBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderCol = (
    lane: SwimlaneGroup,
    colKey: TaskStatus,
    label: string,
    icon?: string,
    isTodayFocus?: boolean,
  ) => (
    <SwimlaneColumn
      key={colKey}
      lane={lane}
      colKey={colKey}
      label={label}
      icon={icon}
      isTodayFocus={isTodayFocus}
      density={density}
      dragOverKey={dragOverKey}
      setDragOverKey={setDragOverKey}
      dragOverTaskId={dragOverTaskId}
      setDragOverTaskId={setDragOverTaskId}
      onSelectTask={onSelectTask}
      onUpdateTaskStatus={onUpdateTaskStatus}
      onMoveTask={onMoveTask}
      onCompleteTask={onCompleteTask}
      onReorderTasks={onReorderTasks}
      onCreateTaskInColumn={onCreateTaskInColumn}
    />
  );

  return (
    <div className="w-full flex-1 flex flex-col p-6 space-y-6">
      {/* 6-Column Sticky Column Headers */}
      <div className="w-full grid grid-cols-6 gap-3.5 sticky top-[65px] z-20 bg-[#0E1111]/95 py-2 backdrop-blur-sm border-b border-[#2A3235]">
        <div
          data-testid="column-header"
          className="flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg bg-[#121718] border border-[#2A3235]"
        >
          <span className="text-xs font-semibold text-gray-200">Triage</span>
          {onToggleHideRepeatingTriage && (
            <RepeatingTriageToggle
              hideRepeatingTriage={hideRepeatingTriage}
              hiddenCount={hiddenRepeatingTriageCount}
              onToggle={onToggleHideRepeatingTriage}
              testId="hide-repeating-triage-toggle"
              countTestId="hidden-repeating-triage-count"
              compact
            />
          )}
        </div>

        <div
          data-testid="column-header"
          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#121718] border border-[#2A3235]"
        >
          <span className="text-xs font-semibold text-gray-200">Todo</span>
        </div>

        <div className="col-span-3 grid grid-cols-3 gap-2 px-2 py-1 rounded-xl bg-[#12191A] border border-emerald-500/30 shadow-sm">
          <div
            data-testid="column-header"
            className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300"
          >
            <span className="text-xs font-bold flex items-center gap-1.5">
              ⚡ Today
            </span>
          </div>
          <div
            data-testid="column-header"
            className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#151D1F] border border-[#2A3235] text-gray-300"
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              📅 This Week
            </span>
          </div>
          <div
            data-testid="column-header"
            className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#151D1F] border border-[#2A3235] text-gray-300"
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              🗓 This Month
            </span>
          </div>
        </div>

        <div
          data-testid="column-header"
          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#121718] border border-[#2A3235]"
        >
          <span className="text-xs font-semibold text-amber-300">Tracking</span>
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        </div>
      </div>

      {/* Swimlane Pods */}
      <div className="w-full space-y-5">
        {swimlanes.map((lane) => {
          const podId = lane.project?.id || "unassigned";
          const isCollapsed = !!collapsed[podId];
          const taskCount = lane.tasks.length;
          const projectName = lane.project?.name || "Unassigned Inbox";
          const projectColor = lane.project?.color || "#9CA3AF";
          const inProgressTasks = lane.tasks.filter(
            (t) =>
              t.status === "in_progress_today" ||
              t.status === "in_progress_week" ||
              t.status === "in_progress_month",
          );

          return (
            <section
              key={podId}
              data-testid={`swimlane-pod-${podId}`}
              className="w-full rounded-2xl bg-[#121718] border border-[#2A3235] shadow-lg shadow-black/40 overflow-hidden transition-all"
            >
              <div className="flex items-center justify-between px-5 py-3.5 bg-[#121718] border-b border-[#2A3235]/70">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full ring-2 ring-[#0E1111] shadow-sm"
                    style={{ backgroundColor: projectColor }}
                  />
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    {projectName}
                  </h3>
                  <span
                    data-testid="swimlane-task-count"
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#1C2224] text-gray-300 border border-[#2A3235]"
                  >
                    {taskCount} {taskCount === 1 ? "task" : "tasks"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="swimlane-collapse-toggle"
                    onClick={() => toggleCollapse(podId)}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#1C2224] transition-colors"
                    aria-label={
                      isCollapsed ? "Expand swimlane" : "Collapse swimlane"
                    }
                  >
                    <svg
                      className={`w-4 h-4 transform transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div
                  data-testid="swimlane-content"
                  className="w-full grid grid-cols-6 gap-3.5 p-4 min-h-[140px] bg-[#0E1111]/40"
                >
                  {renderCol(lane, "triage", "Triage")}
                  {renderCol(lane, "todo", "Todo")}

                  <div
                    data-testid="in-progress-chamber"
                    className="col-span-3 flex flex-col rounded-2xl bg-[#12191A] border-2 border-emerald-500/40 shadow-xl shadow-emerald-950/30 ring-1 ring-emerald-500/20 overflow-hidden"
                  >
                    <div className="px-3.5 py-2 bg-gradient-to-r from-emerald-950/40 via-[#172224] to-emerald-950/30 border-b border-emerald-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          data-testid="in-progress-badge"
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-slate-950 uppercase tracking-wider"
                        >
                          In Progress
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                        {inProgressTasks.length}{" "}
                        {inProgressTasks.length === 1 ? "task" : "tasks"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 p-2 gap-2 flex-1">
                      {renderCol(
                        lane,
                        "in_progress_today",
                        "Today",
                        "⚡",
                        true,
                      )}
                      {renderCol(
                        lane,
                        "in_progress_week",
                        "This Week",
                        "📅",
                        false,
                      )}
                      {renderCol(
                        lane,
                        "in_progress_month",
                        "This Month",
                        "🗓",
                        false,
                      )}
                    </div>
                  </div>

                  {renderCol(lane, "tracking", "Tracking")}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
