// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-005]
// [spec: TASK-006]
import { h } from "preact";
import { useState } from "preact/hooks";
import type { Task, SwimlaneGroup, TaskStatus } from "../../shared/types.js";
import type { CardDensity } from "./TopBar.js";

interface SwimlaneBoardProps {
  swimlanes: SwimlaneGroup[];
  density?: CardDensity;
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
}

const COLUMNS: { key: TaskStatus; label: string; group?: string }[] = [
  { key: "triage", label: "Triage" },
  { key: "todo", label: "Todo" },
  { key: "in_progress_today", label: "Today", group: "In Progress" },
  { key: "in_progress_week", label: "This Week", group: "In Progress" },
  { key: "in_progress_month", label: "This Month", group: "In Progress" },
  { key: "tracking", label: "Tracking" },
];

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

export function SwimlaneBoard({
  swimlanes,
  density = "compact",
  onSelectTask,
  onUpdateTaskStatus,
  onMoveTask,
  onCompleteTask,
  onReorderTasks,
}: SwimlaneBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full flex-1 flex flex-col p-6 space-y-6">
      {/* 6-Column Sticky Column Headers */}
      <div className="w-full grid grid-cols-6 gap-4 sticky top-[65px] z-20 bg-[#0E1111]/95 py-2 backdrop-blur-sm border-b border-[#2A3235]">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            data-testid="column-header"
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#121718] border border-[#2A3235]"
          >
            <div className="flex items-center gap-1.5">
              {col.group && (
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/80">
                  {col.group}:
                </span>
              )}
              <span className="text-xs font-semibold text-gray-200">
                {col.label}
              </span>
            </div>
            {col.key === "tracking" && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* Swimlane Pods */}
      <div className="w-full space-y-5">
        {swimlanes.map((lane) => {
          const podId = lane.project?.id || "unassigned";
          const isCollapsed = !!collapsed[podId];
          const taskCount = lane.tasks.length;
          const projectName = lane.project?.name || "Unassigned Inbox";
          const projectColor = lane.project?.color || "#9CA3AF";

          return (
            <section
              key={podId}
              data-testid={`swimlane-pod-${podId}`}
              className="w-full rounded-2xl bg-[#121718] border border-[#2A3235] shadow-lg shadow-black/40 overflow-hidden transition-all"
            >
              {/* Pod Header */}
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

              {/* Pod Content: 6-Track Grid */}
              {!isCollapsed && (
                <div
                  data-testid="swimlane-content"
                  className="w-full grid grid-cols-6 gap-3.5 p-4 min-h-[140px] bg-[#0E1111]/40"
                >
                  {COLUMNS.map((col) => {
                    const colTasks = lane.tasks.filter(
                      (t) => t.status === col.key,
                    );
                    const cellKey = `${podId}-${col.key}`;
                    const isDragOver = dragOverKey === cellKey;

                    return (
                      <div
                        key={col.key}
                        data-col={col.key}
                        data-swimlane={podId}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer)
                            e.dataTransfer.dropEffect = "move";
                          if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                        }}
                        onDragLeave={() => {
                          if (dragOverKey === cellKey) setDragOverKey(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverKey(null);
                          setDragOverTaskId(null);
                          const raw =
                            e.dataTransfer?.getData("application/kaj-task") ||
                            e.dataTransfer?.getData("text/plain");
                          if (!raw) return;
                          try {
                            const data = JSON.parse(raw);
                            if (data.taskId) {
                              const targetProjectId = lane.project?.id || null;
                              if (onMoveTask) {
                                onMoveTask(
                                  data.taskId,
                                  col.key,
                                  targetProjectId,
                                );
                              } else {
                                onUpdateTaskStatus(data.taskId, col.key);
                              }
                              const currentIds = colTasks
                                .map((t) => t.id)
                                .filter((id) => id !== data.taskId);
                              currentIds.push(data.taskId);
                              if (onReorderTasks) {
                                onReorderTasks(currentIds);
                              }
                            }
                          } catch (err) {
                            console.error("Error handling drop on board:", err);
                          }
                        }}
                        className={`flex flex-col space-y-2 rounded-xl p-2 min-h-[110px] transition-all ${
                          isDragOver
                            ? "bg-emerald-500/10 ring-2 ring-emerald-500/50 border border-emerald-500/40 shadow-inner"
                            : "bg-[#121718]/40 border border-[#2A3235]/40"
                        }`}
                      >
                        {colTasks.map((task) => {
                          const isTracking = task.status === "tracking";
                          const priStyle =
                            PRIORITY_STYLES[task.priority] ||
                            PRIORITY_STYLES.week;

                          const handleCardDragOver = (e: DragEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.dataTransfer)
                              e.dataTransfer.dropEffect = "move";
                            if (dragOverTaskId !== task.id)
                              setDragOverTaskId(task.id);
                          };

                          const handleCardDragLeave = (e: DragEvent) => {
                            e.stopPropagation();
                            if (dragOverTaskId === task.id)
                              setDragOverTaskId(null);
                          };

                          const handleCardDrop = (e: DragEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverTaskId(null);
                            setDragOverKey(null);
                            const raw =
                              e.dataTransfer?.getData("application/kaj-task") ||
                              e.dataTransfer?.getData("text/plain");
                            if (!raw) return;
                            try {
                              const data = JSON.parse(raw);
                              const draggedId = data.taskId;
                              if (!draggedId || draggedId === task.id) return;

                              const targetProjectId = lane.project?.id || null;
                              if (
                                data.sourceStatus !== col.key ||
                                data.sourceProjectId !== targetProjectId
                              ) {
                                if (onMoveTask)
                                  onMoveTask(
                                    draggedId,
                                    col.key,
                                    targetProjectId,
                                  );
                                else onUpdateTaskStatus(draggedId, col.key);
                              }

                              const currentIds = colTasks
                                .map((t) => t.id)
                                .filter((id) => id !== draggedId);
                              const targetIdx = currentIds.indexOf(task.id);
                              currentIds.splice(targetIdx, 0, draggedId);
                              if (onReorderTasks) {
                                onReorderTasks(currentIds);
                              }
                            } catch (err) {
                              console.error("Error reordering task:", err);
                            }
                          };

                          // Minimal Density View (UI-005)
                          if (density === "minimal") {
                            return (
                              <article
                                key={task.id}
                                data-testid="task-card"
                                data-task-id={task.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  const payload = JSON.stringify({
                                    taskId: task.id,
                                    sourceStatus: task.status,
                                    sourceProjectId: task.project_id,
                                  });
                                  e.dataTransfer?.setData(
                                    "application/kaj-task",
                                    payload,
                                  );
                                  e.dataTransfer?.setData(
                                    "text/plain",
                                    payload,
                                  );
                                  if (e.dataTransfer)
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={handleCardDragOver}
                                onDragLeave={handleCardDragLeave}
                                onDrop={handleCardDrop}
                                className={`group relative rounded-lg py-1 px-2.5 bg-[#1C2224] transition-all hover:border-gray-500 hover:shadow-sm cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 h-9 min-h-[36px] max-h-[38px] ${
                                  dragOverTaskId === task.id
                                    ? "ring-2 ring-emerald-400 border-emerald-400 shadow-md"
                                    : isTracking
                                      ? "border-2 border-dashed border-amber-500/60"
                                      : "border border-[#2A3235]"
                                }`}
                                onClick={(e) => {
                                  if (
                                    (e.target as HTMLElement).tagName ===
                                      "BUTTON" ||
                                    (e.target as HTMLElement).closest("button")
                                  )
                                    return;
                                  onSelectTask(task);
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCompleteTask(task.id);
                                    }}
                                    title="Mark complete"
                                    className="p-0.5 rounded text-gray-400 hover:text-emerald-400 transition-colors shrink-0"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2.5"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </button>
                                  <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      task.priority === "today"
                                        ? "bg-rose-500"
                                        : task.priority === "week"
                                          ? "bg-amber-500"
                                          : task.priority === "month"
                                            ? "bg-sky-500"
                                            : task.priority === "quarter"
                                              ? "bg-indigo-500"
                                              : "bg-stone-500"
                                    }`}
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
                                      ⚑ {task.due_date.slice(5)}
                                    </span>
                                  )}
                                </div>
                              </article>
                            );
                          }

                          // Compact Density View (Default, UI-005)
                          return (
                            <article
                              key={task.id}
                              data-testid="task-card"
                              data-task-id={task.id}
                              draggable={true}
                              onDragStart={(e) => {
                                const payload = JSON.stringify({
                                  taskId: task.id,
                                  sourceStatus: task.status,
                                  sourceProjectId: task.project_id,
                                });
                                e.dataTransfer?.setData(
                                  "application/kaj-task",
                                  payload,
                                );
                                e.dataTransfer?.setData("text/plain", payload);
                                if (e.dataTransfer)
                                  e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={handleCardDragOver}
                              onDragLeave={handleCardDragLeave}
                              onDrop={handleCardDrop}
                              className={`group relative rounded-xl p-2.5 bg-[#1C2224] transition-all hover:border-gray-500 hover:shadow-md cursor-grab active:cursor-grabbing ${
                                dragOverTaskId === task.id
                                  ? "ring-2 ring-emerald-400 border-emerald-400 shadow-md"
                                  : isTracking
                                    ? "border-2 border-dashed border-amber-500/60 shadow-amber-950/20"
                                    : "border border-[#2A3235]"
                              }`}
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).tagName ===
                                    "BUTTON" ||
                                  (e.target as HTMLElement).closest("button")
                                )
                                  return;
                                onSelectTask(task);
                              }}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${priStyle.badge}`}
                                >
                                  {priStyle.label}
                                </span>
                                <div className="flex items-center gap-1">
                                  {task.repeat_rule !== "none" && (
                                    <span
                                      title={`Recurring: ${task.repeat_rule}`}
                                      className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    >
                                      ↻
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCompleteTask(task.id);
                                    }}
                                    title="Mark complete"
                                    className="p-0.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-[#121718] transition-colors"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2.5"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </button>
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
                                    <span>▶</span> {task.action_date}
                                  </span>
                                )}
                                {task.due_date && (
                                  <span className="flex items-center gap-0.5 text-rose-400 font-medium">
                                    <span>⚑</span> {task.due_date}
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
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
