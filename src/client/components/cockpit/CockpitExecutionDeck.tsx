// [spec: UI-009]
import { h } from "preact";
import {
  type Task,
  type Project,
  type TaskStatus,
  formatDisplayDateDMY,
} from "../../../shared/types.js";
import { PRIORITY_STYLES } from "./types.js";

interface CockpitExecutionDeckProps {
  vipTriageTasks?: Task[];
  todayTasks: Task[];
  trackingTasks: Task[];
  upcomingTasks: Task[];
  projectMap: Map<string, Project>;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onAddTask: () => void;
}

export function CockpitExecutionDeck({
  vipTriageTasks = [],
  todayTasks,
  trackingTasks,
  upcomingTasks,
  projectMap,
  onSelectTask,
  onCompleteTask,
  onUpdateTaskStatus,
  onAddTask,
}: CockpitExecutionDeckProps) {
  return (
    <div className="col-span-12 lg:col-span-7 space-y-5">
      {/* VIP Triage Plate - unassigned tasks in status triage from VIP users (project_id == null) */}
      <section
        data-testid="cockpit-vip-triage-plate"
        className="rounded-2xl bg-gradient-to-b from-purple-950/40 via-[#18131e] to-[#121718] border border-purple-500/40 p-5 shadow-lg"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-purple-400 tracking-wide flex items-center gap-1.5">
              👑 VIP TRIAGE QUEUE
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold">
              {vipTriageTasks.length}{" "}
              {vipTriageTasks.length === 1 ? "Task" : "Tasks"}
            </span>
          </div>
          <span className="text-[11px] text-purple-300/70 font-medium">
            Unassigned Triage
          </span>
        </div>

        <div className="space-y-2.5">
          {vipTriageTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-4 text-center">
              No unassigned triage tasks from VIP users.
            </div>
          ) : (
            vipTriageTasks.map((task) => {
              const prio =
                PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.today;
              return (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  onClick={() => onSelectTask(task)}
                  className="group rounded-xl bg-[#1C2224] border border-purple-500/30 hover:border-purple-400/60 p-3 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label="Complete task"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompleteTask(task.id);
                      }}
                      className="w-4 h-4 rounded-full border border-purple-400/60 hover:border-purple-400 hover:bg-purple-500/20 flex items-center justify-center shrink-0 transition-colors"
                    />
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${prio.badge}`}
                    >
                      {prio.label}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      {task.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {task.created_by && (
                      <span
                        title={`VIP Creator: ${task.created_by}`}
                        className="px-2 py-0.5 rounded bg-purple-950/50 text-purple-300 border border-purple-500/30 truncate max-w-[120px] font-medium"
                      >
                        👑 {task.created_by}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTaskStatus(task.id, "in_progress_today");
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors"
                      title="Promote to Today Focus Plate"
                    >
                      ⚡ Today
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Today Focus Plate */}

      <section
        data-testid="cockpit-today-focus-plate"
        className="rounded-2xl bg-gradient-to-b from-emerald-950/30 to-[#121718] border border-emerald-500/40 p-5 shadow-lg"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-500/20">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-emerald-400 tracking-wide flex items-center gap-1.5">
              ⚡ TODAY FOCUS PLATE
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
              {todayTasks.length} {todayTasks.length === 1 ? "Task" : "Tasks"}
            </span>
          </div>
          <button
            type="button"
            onClick={onAddTask}
            className="px-2.5 py-1 rounded-lg bg-[#10B981] hover:bg-[#34D399] text-[#0E1111] font-bold text-xs transition-colors"
          >
            + Quick Add
          </button>
        </div>

        <div className="space-y-2.5">
          {todayTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-6 text-center">
              No active tasks in Today focus plate. Promote tasks from upcoming
              horizons to focus here today.
            </div>
          ) : (
            todayTasks.map((task) => {
              const prio =
                PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.week;
              const proj = task.project_id
                ? projectMap.get(task.project_id)
                : null;
              return (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  onClick={() => onSelectTask(task)}
                  className="group rounded-xl bg-[#1C2224] border border-[#2A3235] hover:border-emerald-500/50 p-3 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label="Complete task"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompleteTask(task.id);
                      }}
                      className="w-4 h-4 rounded-full border border-emerald-400/60 hover:border-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center shrink-0 transition-colors"
                    />
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${prio.badge}`}
                    >
                      {prio.label}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {proj && (
                      <span className="px-2 py-0.5 rounded bg-[#121718] text-emerald-400 border border-[#2A3235] truncate max-w-[120px]">
                        {proj.name}
                      </span>
                    )}
                    {task.created_by && (
                      <span
                        title={`Created by: ${task.created_by}`}
                        className="px-2 py-0.5 rounded bg-[#161B1C] text-stone-300 border border-[#2A3235] truncate max-w-[100px]"
                      >
                        👤 {task.created_by}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-rose-400 font-medium">
                        ⚑ {formatDisplayDateDMY(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Upcoming Horizons: This Week & Month */}
      <section className="rounded-2xl bg-[#121718] border border-[#2A3235] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#2A3235]">
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            📅 UPCOMING HORIZONS (WEEK &amp; MONTH)
          </span>
          <span className="text-xs text-gray-400">
            {upcomingTasks.length} queued
          </span>
        </div>

        <div className="space-y-2">
          {upcomingTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-3 text-center">
              No tasks currently scheduled in Week or Month horizons.
            </div>
          ) : (
            upcomingTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="rounded-xl bg-[#1C2224] border border-[#2A3235] hover:border-gray-500 p-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                      task.status === "in_progress_week"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    }`}
                  >
                    {task.status === "in_progress_week" ? "Week" : "Month"}
                  </span>
                  <span className="text-gray-200 truncate font-medium">
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.created_by && (
                    <span className="text-stone-400">👤 {task.created_by}</span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTaskStatus(task.id, "in_progress_today");
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors"
                    title="Promote to Today Focus Plate"
                  >
                    ⚡ Today
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Tracking & Blockers Container */}
      <section
        data-testid="cockpit-tracking-container"
        className="rounded-2xl bg-[#121718] border border-dashed border-amber-500/50 p-4 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 tracking-wide">
              ⏳ TRACKING &amp; WAITING ON
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold">
              {trackingTasks.length}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            External Deliveries / Blockers
          </span>
        </div>

        <div className="space-y-2">
          {trackingTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-4 text-center">
              No tasks currently blocked or waiting on external dependencies.
            </div>
          ) : (
            trackingTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="rounded-xl bg-[#1C2224] border border-[#2A3235] hover:border-amber-500/40 p-3 transition-colors cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label="Complete task"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompleteTask(task.id);
                    }}
                    className="w-4 h-4 rounded-full border border-gray-500 hover:border-emerald-400 hover:bg-emerald-500/20 shrink-0 transition-colors"
                  />
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">
                      {task.title}
                    </p>
                    {task.waiting_on && (
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        ⏳ {task.waiting_on}
                      </span>
                    )}
                  </div>
                </div>
                {task.created_by && (
                  <span className="text-xs text-stone-400 shrink-0">
                    👤 {task.created_by}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
