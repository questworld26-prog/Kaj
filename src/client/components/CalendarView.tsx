// [spec: UI-003]
import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import type { Task, CalendarEvent } from '../../shared/types.js';

interface CalendarViewProps {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  unscheduledTasks: Task[];
  onSelectTask: (task: Task) => void;
  onScheduleTask: (taskId: string, dateStr: string) => void;
}

type HorizonView = 'month' | 'week';
type FilterType = 'all' | 'action' | 'due';

function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarView({
  tasks,
  calendarEvents,
  unscheduledTasks,
  onSelectTask,
  onScheduleTask,
}: CalendarViewProps) {
  const [horizon, setHorizon] = useState<HorizonView>('month');
  const [filter, setFilter] = useState<FilterType>('all');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const todayStr = useMemo(() => {
    return formatDateToYMD(new Date());
  }, []);

  // Compute month days (Monday-based grid)
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Get starting Monday
    const startDay = firstDayOfMonth.getDay(); // 0 = Sun, 1 = Mon ...
    const offset = startDay === 0 ? 6 : startDay - 1;

    const startDate = new Date(year, month, 1 - offset);

    // 42 days grid (6 weeks)
    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = formatDateToYMD(d);
      days.push({
        date: d,
        dateStr,
        isCurrentMonth: d.getMonth() === month,
      });
    }
    return days;
  }, [currentDate]);

  // Compute 7 days for week view
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));

    const days: { date: Date; dateStr: string; dayName: string }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      const dateStr = formatDateToYMD(current);
      days.push({
        date: current,
        dateStr,
        dayName: dayNames[i],
      });
    }
    return days;
  }, [currentDate]);

  // Group events by date and type
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { action: CalendarEvent[]; due: CalendarEvent[] }>();

    for (const ev of calendarEvents) {
      if (!map.has(ev.date)) {
        map.set(ev.date, { action: [], due: [] });
      }
      const entry = map.get(ev.date)!;
      if (ev.date_type === 'action') entry.action.push(ev);
      if (ev.date_type === 'due') entry.due.push(ev);
    }

    return map;
  }, [calendarEvents]);

  // Navigation handlers
  const handlePrev = () => {
    if (horizon === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (horizon === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthYearLabel = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      data-testid="calendar-view"
      className="w-full flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden"
    >
      {/* Main Calendar Body */}
      <div className="flex-1 flex flex-col bg-[#121718] rounded-2xl border border-[#2A3235] p-5 shadow-lg shadow-black/40">
        {/* Calendar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2A3235]">
          {/* Horizon Toggle */}
          <div className="flex items-center gap-1 bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]">
            <button
              type="button"
              data-testid="view-month-btn"
              onClick={() => setHorizon('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                horizon === 'month'
                  ? 'bg-[#1C2224] text-emerald-400 border border-[#2A3235]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Month View
            </button>
            <button
              type="button"
              data-testid="view-week-btn"
              onClick={() => setHorizon('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                horizon === 'week'
                  ? 'bg-[#1C2224] text-emerald-400 border border-[#2A3235]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Week View
            </button>
          </div>

          {/* Navigation & Label */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235]"
              title="Previous"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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

          {/* Filter Toggles */}
          <div className="flex items-center gap-1 bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]">
            <button
              type="button"
              data-testid="filter-all-btn"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === 'all'
                  ? 'bg-[#1C2224] text-white border border-[#2A3235]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-testid="filter-action-btn"
              onClick={() => setFilter('action')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === 'action'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>▶</span> Action
            </button>
            <button
              type="button"
              data-testid="filter-due-btn"
              onClick={() => setFilter('due')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === 'due'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>⚑</span> Due
            </button>
          </div>
        </div>

        {/* View Horizon: Month Grid */}
        {horizon === 'month' ? (
          <div className="flex-1 flex flex-col mt-4">
            {/* Weekday names */}
            <div className="grid grid-cols-7 gap-2 pb-2 text-center text-xs font-bold text-gray-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Days grid */}
            <div className="flex-1 grid grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const dayEvents = eventsByDate.get(day.dateStr);
                const showAction = filter === 'all' || filter === 'action';
                const showDue = filter === 'all' || filter === 'due';
                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={day.dateStr}
                    className={`min-h-[90px] rounded-xl p-2 border flex flex-col transition-colors ${
                      day.isCurrentMonth
                        ? 'bg-[#1C2224]/50 border-[#2A3235]'
                        : 'bg-[#121718]/30 border-[#2A3235]/40 opacity-40'
                    } ${isToday ? 'ring-2 ring-emerald-500/40' : ''}`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                      <span className={isToday ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                        {day.date.getDate()}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                      {/* Action Date Badges */}
                      {showAction &&
                        dayEvents?.action.map((ev) => (
                          <div
                            key={`act-${ev.task_id}-${ev.date}`}
                            data-testid="badge-action-date"
                            onClick={() => {
                              const t = tasks.find((x) => x.id === ev.task_id);
                              if (t) onSelectTask(t);
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 ${
                              ev.is_virtual ? 'border-dashed' : ''
                            }`}
                            title={`Action Date: ${ev.title}`}
                          >
                            <span className="text-emerald-400">▶</span>
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}

                      {/* Due Date Badges */}
                      {showDue &&
                        dayEvents?.due.map((ev) => (
                          <div
                            key={`due-${ev.task_id}-${ev.date}`}
                            data-testid="badge-due-date"
                            onClick={() => {
                              const t = tasks.find((x) => x.id === ev.task_id);
                              if (t) onSelectTask(t);
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 ${
                              ev.is_virtual ? 'border-dashed' : ''
                            }`}
                            title={`Due Date: ${ev.title}`}
                          >
                            <span className="text-rose-400">⚑</span>
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* View Horizon: Week Grid */
          <div data-testid="calendar-week-grid" className="flex-1 grid grid-cols-7 gap-3 mt-4">
            {weekDays.map((day) => {
              const dayEvents = eventsByDate.get(day.dateStr);
              const showAction = filter === 'all' || filter === 'action';
              const showDue = filter === 'all' || filter === 'due';
              const isToday = day.dateStr === todayStr;

              return (
                <div
                  key={day.dateStr}
                  data-testid="week-day-column"
                  className={`flex flex-col rounded-xl p-3 bg-[#1C2224]/60 border border-[#2A3235] min-h-[350px] ${
                    isToday ? 'ring-2 ring-emerald-500/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2A3235]">
                    <span className="text-xs font-bold text-gray-300">{day.dayName}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        isToday ? 'bg-emerald-500 text-[#0E1111]' : 'text-gray-400'
                      }`}
                    >
                      {day.date.getDate()}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                    {/* Action badges */}
                    {showAction &&
                      dayEvents?.action.map((ev) => (
                        <div
                          key={`act-w-${ev.task_id}-${ev.date}`}
                          data-testid="badge-action-date"
                          onClick={() => {
                            const t = tasks.find((x) => x.id === ev.task_id);
                            if (t) onSelectTask(t);
                          }}
                          className={`flex items-start gap-1.5 p-2 rounded-lg text-xs font-medium cursor-pointer bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/20 ${
                            ev.is_virtual ? 'border-dashed' : ''
                          }`}
                        >
                          <span className="text-emerald-400 font-bold">▶</span>
                          <span className="break-words">{ev.title}</span>
                        </div>
                      ))}

                    {/* Due badges */}
                    {showDue &&
                      dayEvents?.due.map((ev) => (
                        <div
                          key={`due-w-${ev.task_id}-${ev.date}`}
                          data-testid="badge-due-date"
                          onClick={() => {
                            const t = tasks.find((x) => x.id === ev.task_id);
                            if (t) onSelectTask(t);
                          }}
                          className={`flex items-start gap-1.5 p-2 rounded-lg text-xs font-medium cursor-pointer bg-rose-500/10 text-rose-200 border border-rose-500/30 hover:bg-rose-500/20 ${
                            ev.is_virtual ? 'border-dashed' : ''
                          }`}
                        >
                          <span className="text-rose-400 font-bold">⚑</span>
                          <span className="break-words">{ev.title}</span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unscheduled Tasks Sidebar */}
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
            <div className="text-center py-8 text-xs text-gray-500 italic">
              All active tasks are scheduled!
            </div>
          ) : (
            unscheduledTasks.map((t) => (
              <div
                key={t.id}
                data-task-id={t.id}
                className="rounded-xl p-3 bg-[#1C2224] border border-[#2A3235] hover:border-gray-500 transition-colors flex flex-col gap-2"
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
    </div>
  );
}
