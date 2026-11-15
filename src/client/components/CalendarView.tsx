// [spec: UI-003]
import { h } from "preact";
import { useState, useMemo, useEffect } from "preact/hooks";
import type { Task, CalendarEvent } from "../../shared/types.js";
import {
  computeMonthDays,
  computeWeekDays,
  formatDateToYMD,
  groupCalendarEventsByDate,
  type FilterType,
  type HorizonView,
} from "./calendar/calendar-helpers.js";
import {
  CalendarMonthGrid,
  CalendarWeekGrid,
} from "./calendar/CalendarGridViews.js";
import { UnscheduledSidebar } from "./calendar/UnscheduledSidebar.js";

interface CalendarViewProps {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  unscheduledTasks: Task[];
  onSelectTask: (task: Task) => void;
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void;
  onRangeChange?: (start: string, end: string) => void;
  onCreateTaskOnDate?: (dateStr: string) => void;
}

export function CalendarView({
  tasks,
  calendarEvents,
  unscheduledTasks,
  onSelectTask,
  onScheduleTask,
  onRangeChange,
  onCreateTaskOnDate,
}: CalendarViewProps) {
  const [horizon, setHorizon] = useState<HorizonView>("month");
  const [filter, setFilter] = useState<FilterType>("all");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const todayStr = useMemo(() => formatDateToYMD(new Date()), []);
  const monthDays = useMemo(() => computeMonthDays(currentDate), [currentDate]);
  const weekDays = useMemo(() => computeWeekDays(currentDate), [currentDate]);
  const eventsByDate = useMemo(
    () => groupCalendarEventsByDate(calendarEvents),
    [calendarEvents],
  );

  useEffect(() => {
    if (!onRangeChange) return;
    if (horizon === "month" && monthDays.length > 0) {
      onRangeChange(
        monthDays[0].dateStr,
        monthDays[monthDays.length - 1].dateStr,
      );
    } else if (horizon === "week" && weekDays.length > 0) {
      onRangeChange(weekDays[0].dateStr, weekDays[weekDays.length - 1].dateStr);
    }
  }, [horizon, currentDate, onRangeChange, monthDays, weekDays]);

  const handlePrev = () => {
    if (horizon === "month") {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
      );
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (horizon === "month") {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
      );
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const handleToday = () => setCurrentDate(new Date());

  const monthYearLabel = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      data-testid="calendar-view"
      className="w-full flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden"
    >
      <div className="flex-1 flex flex-col bg-[#121718] rounded-2xl border border-[#2A3235] p-5 shadow-lg shadow-black/40">
        {/* Calendar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2A3235]">
          <div className="flex items-center gap-1 bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]">
            <button
              type="button"
              data-testid="view-month-btn"
              onClick={() => setHorizon("month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                horizon === "month"
                  ? "bg-[#1C2224] text-emerald-400 border border-[#2A3235]"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Month View
            </button>
            <button
              type="button"
              data-testid="view-week-btn"
              onClick={() => setHorizon("week")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                horizon === "week"
                  ? "bg-[#1C2224] text-emerald-400 border border-[#2A3235]"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Week View
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235]"
              title="Previous"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-sm font-bold text-gray-100 min-w-[130px] text-center">
              {monthYearLabel}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235]"
              title="Next"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235]"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]">
            <button
              type="button"
              data-testid="filter-all-btn"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === "all"
                  ? "bg-[#1C2224] text-white border border-[#2A3235]"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-testid="filter-action-btn"
              onClick={() => setFilter("action")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === "action"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>▶</span> Action
            </button>
            <button
              type="button"
              data-testid="filter-due-btn"
              onClick={() => setFilter("due")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === "due"
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>⚑</span> Due
            </button>
          </div>
        </div>

        {horizon === "month" ? (
          <CalendarMonthGrid
            days={monthDays}
            eventsByDate={eventsByDate}
            filter={filter}
            todayStr={todayStr}
            dragOverDate={dragOverDate}
            setDragOverDate={setDragOverDate}
            tasks={tasks}
            onSelectTask={onSelectTask}
            onScheduleTask={onScheduleTask}
            onCreateTaskOnDate={onCreateTaskOnDate}
          />
        ) : (
          <CalendarWeekGrid
            days={weekDays}
            eventsByDate={eventsByDate}
            filter={filter}
            todayStr={todayStr}
            dragOverDate={dragOverDate}
            setDragOverDate={setDragOverDate}
            tasks={tasks}
            onSelectTask={onSelectTask}
            onScheduleTask={onScheduleTask}
            onCreateTaskOnDate={onCreateTaskOnDate}
          />
        )}
      </div>

      <UnscheduledSidebar
        unscheduledTasks={unscheduledTasks}
        todayStr={todayStr}
        onSelectTask={onSelectTask}
        onScheduleTask={onScheduleTask}
      />
    </div>
  );
}
