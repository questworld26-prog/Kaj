// [spec: UI-001]
// [spec: UI-002]
import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { Task, SwimlaneGroup, TaskStatus } from '../../shared/types.js';

interface SwimlaneBoardProps {
  swimlanes: SwimlaneGroup[];
  onSelectTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onCompleteTask: (taskId: string) => void;
  onReorderProject?: (projectId: string, direction: 'up' | 'down') => void;
}

const COLUMNS: { key: TaskStatus; label: string; group?: string }[] = [
  { key: 'triage', label: 'Triage' },
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress_today', label: 'Today', group: 'In Progress' },
  { key: 'in_progress_week', label: 'This Week', group: 'In Progress' },
  { key: 'in_progress_month', label: 'This Month', group: 'In Progress' },
  { key: 'tracking', label: 'Tracking' },
];

const PRIORITY_STYLES: Record<string, { label: string; badge: string }> = {
  today: { label: 'Today', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  week: { label: 'Week', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  month: { label: 'Month', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  quarter: { label: 'Quarter', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  year: { label: 'Year', badge: 'bg-stone-500/10 text-stone-400 border-stone-500/30' },
};

export function SwimlaneBoard({
  swimlanes,
  onSelectTask,
  onUpdateTaskStatus,
  onCompleteTask,
}: SwimlaneBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
              <span className="text-xs font-semibold text-gray-200">{col.label}</span>
            </div>
            {col.key === 'tracking' && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* Swimlane Pods */}
      <div className="w-full space-y-5">
        {swimlanes.map((lane) => {
          const podId = lane.project?.id || 'unassigned';
          const isCollapsed = !!collapsed[podId];
          const taskCount = lane.tasks.length;
          const projectName = lane.project?.name || 'Unassigned Inbox';
          const projectColor = lane.project?.color || '#9CA3AF';

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
                    {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="swimlane-collapse-toggle"
                    onClick={() => toggleCollapse(podId)}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#1C2224] transition-colors"
                    aria-label={isCollapsed ? 'Expand swimlane' : 'Collapse swimlane'}
                  >
                    <svg
                      className={`w-4 h-4 transform transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
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
                    const colTasks = lane.tasks.filter((t) => t.status === col.key);

                    return (
                      <div
                        key={col.key}
                        data-col={col.key}
                        className="flex flex-col space-y-2.5 rounded-xl p-2 bg-[#121718]/40 border border-[#2A3235]/40 min-h-[110px]"
                      >
                        {colTasks.map((task) => {
                          const isTracking = task.status === 'tracking';
                          const priStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.week;

                          return (
                            <article
                              key={task.id}
                              data-testid="task-card"
                              data-task-id={task.id}
                              className={`group relative rounded-xl p-3 bg-[#1C2224] transition-all hover:border-gray-500 hover:shadow-md cursor-pointer ${
                                isTracking
                                  ? 'border-2 border-dashed border-amber-500/60 shadow-amber-950/20'
                                  : 'border border-[#2A3235]'
                              }`}
                              onClick={(e) => {
                                // Ignore if select or button was clicked
                                if (
                                  (e.target as HTMLElement).tagName === 'SELECT' ||
                                  (e.target as HTMLElement).tagName === 'BUTTON' ||
                                  (e.target as HTMLElement).closest('button')
                                ) {
                                  return;
                                }
                                onSelectTask(task);
                              }}
                            >
                              {/* Header badges: Priority & Recurrence */}
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${priStyle.badge}`}
                                >
                                  {priStyle.label}
                                </span>

                                <div className="flex items-center gap-1">
                                  {task.repeat_rule !== 'none' && (
                                    <span
                                      title={`Recurring: ${task.repeat_rule}`}
                                      className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    >
                                      ↻ {task.repeat_rule}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onCompleteTask(task.id)}
                                    title="Mark complete"
                                    className="p-1 rounded text-gray-400 hover:text-emerald-400 hover:bg-[#121718] transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Title */}
                              <h4 className="text-xs font-semibold text-gray-100 line-clamp-2 mb-2 leading-relaxed">
                                {task.title}
                              </h4>

                              {/* Blocker badge for tracking cards */}
                              {isTracking && (
                                <div
                                  data-testid="blocker-badge"
                                  className="mb-2 flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium"
                                >
                                  <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  <span className="truncate">{task.waiting_on || 'Waiting on blocker'}</span>
                                </div>
                              )}

                              {/* Dates info */}
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 mb-2">
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
                              </div>

                              {/* Quick Status Select */}
                              <div className="pt-2 border-t border-[#2A3235]/60 flex items-center justify-between">
                                <label className="text-[10px] text-gray-500 font-medium">Move:</label>
                                <select
                                  data-testid="task-status-select"
                                  value={task.status}
                                  onChange={(e) => {
                                    const val = (e.target as HTMLSelectElement).value as TaskStatus;
                                    onUpdateTaskStatus(task.id, val);
                                  }}
                                  className="text-[10px] bg-[#121718] text-gray-300 rounded px-1.5 py-0.5 border border-[#2A3235] focus:border-emerald-500 focus:outline-none"
                                >
                                  <option value="triage">Triage</option>
                                  <option value="todo">Todo</option>
                                  <option value="in_progress_today">In Progress: Today</option>
                                  <option value="in_progress_week">In Progress: This Week</option>
                                  <option value="in_progress_month">In Progress: This Month</option>
                                  <option value="tracking">Tracking</option>
                                  <option value="done">Done</option>
                                </select>
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
