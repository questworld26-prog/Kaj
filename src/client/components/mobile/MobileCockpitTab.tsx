// [spec: UI-006]
// [spec: UI-008]
import { h } from "preact";
import { useState } from "preact/hooks";
import type { Task, Project } from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { MobileTaskCard } from "./MobileTaskCard.js";

interface MobileCockpitTabProps {
  tasks: Task[];
  projectMap: Map<string, Project>;
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

export function MobileCockpitTab({
  tasks,
  projectMap,
  density,
  swipedTaskId,
  swipeOffset,
  onSelectTask,
  onCompleteTask,
  onOpenActionSheet,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: MobileCockpitTabProps) {
  const [weekOpen, setWeekOpen] = useState(true);
  const [monthOpen, setMonthOpen] = useState(false);

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

  const todayTasks = tasks.filter((t) => t.status === "in_progress_today");
  const trackingTasks = tasks.filter((t) => t.status === "tracking");
  const weekTasks = tasks.filter((t) => t.status === "in_progress_week");
  const monthTasks = tasks.filter((t) => t.status === "in_progress_month");

  return (
    <div
      data-testid="mobile-cockpit-view"
      className="flex-1 p-3 space-y-3 overflow-y-auto"
    >
      {/* Pinned Today Focus Plate */}
      <section
        data-testid="mobile-today-focus-plate"
        className="rounded-2xl bg-gradient-to-b from-emerald-950/40 to-[#121718] border border-emerald-500/40 p-3 shadow-lg"
      >
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-emerald-500/20">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              ⚡ TODAY FOCUS PLATE
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
              {todayTasks.length}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {todayTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-3 text-center">
              No active tasks in Today focus plate. Tap ▾ on any task to move
              here.
            </div>
          ) : (
            todayTasks.map((task) => renderCard(task))
          )}
        </div>
      </section>

      {/* Tracking / Blocked Container */}
      <section
        data-testid="mobile-tracking-container"
        className="rounded-2xl bg-[#121718] border border-dashed border-amber-500/50 p-3 shadow-sm"
      >
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400">
              ⏳ Tracking &amp; Waiting On
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold">
              {trackingTasks.length}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {trackingTasks.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-2 text-center">
              No tasks currently blocked or waiting on external dependencies.
            </div>
          ) : (
            trackingTasks.map((task) => renderCard(task))
          )}
        </div>
      </section>

      {/* Collapsible This Week Horizon */}
      <section
        data-testid="mobile-horizon-week"
        className="rounded-xl bg-[#121718] border border-[#2A3235] p-3"
      >
        <button
          type="button"
          onClick={() => setWeekOpen(!weekOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-200">
              📅 This Week Chamber
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#1C2224] text-gray-300 border border-[#2A3235]">
              {weekTasks.length}
            </span>
          </div>
          <span className="text-xs text-gray-400">{weekOpen ? "▴" : "▾"}</span>
        </button>
        {weekOpen && (
          <div className="mt-2.5 space-y-2">
            {weekTasks.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2 text-center">
                No tasks assigned to This Week horizon.
              </div>
            ) : (
              weekTasks.map((task) => renderCard(task))
            )}
          </div>
        )}
      </section>

      {/* Collapsible This Month Horizon */}
      <section
        data-testid="mobile-horizon-month"
        className="rounded-xl bg-[#121718] border border-[#2A3235] p-3"
      >
        <button
          type="button"
          onClick={() => setMonthOpen(!monthOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-200">
              🗓 This Month Chamber
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#1C2224] text-gray-300 border border-[#2A3235]">
              {monthTasks.length}
            </span>
          </div>
          <span className="text-xs text-gray-400">{monthOpen ? "▴" : "▾"}</span>
        </button>
        {monthOpen && (
          <div className="mt-2.5 space-y-2">
            {monthTasks.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2 text-center">
                No tasks assigned to This Month horizon.
              </div>
            ) : (
              monthTasks.map((task) => renderCard(task))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
