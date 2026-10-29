// [spec: UI-006]
// [spec: UI-008]
import { h } from "preact";
import { useState, useMemo, useRef } from "preact/hooks";
import type {
  Task,
  Project,
  SwimlaneGroup,
  CalendarEvent,
  TaskStatus,
} from "../../shared/types.js";
import type { CardDensity } from "./TopBar.js";

export type MobileTab = "cockpit" | "pods" | "calendar" | "triage";

interface MobileViewsProps {
  currentTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  swimlanes: SwimlaneGroup[];
  tasks: Task[];
  projects: Project[];
  completedTasks: Task[];
  unscheduledTasks: Task[];
  calendarEvents: CalendarEvent[];
  density: CardDensity;
  onSelectTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onMoveTask?: (
    taskId: string,
    newStatus: TaskStatus,
    newProjectId: string | null,
  ) => void;
  onCompleteTask: (taskId: string) => void;
  onRestoreTask: (taskId: string) => void;
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void;
  onReorderProjects: (projectIds: string[]) => void;
  onOpenReorderModal: () => void;
}

function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

const STATUS_LABELS: Record<TaskStatus, string> = {
  triage: "Triage",
  todo: "Todo",
  in_progress_today: "⚡ Today",
  in_progress_week: "📅 Week",
  in_progress_month: "🗓 Month",
  tracking: "⏳ Tracking",
  done: "✓ Done",
};

export function MobileViews({
  currentTab,
  onTabChange,
  swimlanes,
  tasks,
  projects,
  completedTasks,
  unscheduledTasks,
  calendarEvents,
  density,
  onSelectTask,
  onUpdateTaskStatus,
  onMoveTask,
  onCompleteTask,
  onRestoreTask,
  onScheduleTask,
  onReorderProjects,
  onOpenReorderModal,
}: MobileViewsProps) {
  // Action sheet state
  const [actionSheetTask, setActionSheetTask] = useState<Task | null>(null);

  // Cockpit state
  const [weekOpen, setWeekOpen] = useState(true);
  const [monthOpen, setMonthOpen] = useState(false);

  // Pods state
  const [selectedProjectId, setSelectedProjectId] = useState<string | "all">(
    "all",
  );
  const [collapsedPods, setCollapsedPods] = useState<Record<string, boolean>>(
    {},
  );
  const [podStatusFilter, setPodStatusFilter] = useState<
    Record<string, TaskStatus | "all">
  >({});

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarFilter, setCalendarFilter] = useState<
    "all" | "action" | "due"
  >("all");
  const [unscheduledDrawerOpen, setUnscheduledDrawerOpen] = useState(true);

  // Triage state
  const [triageSubTab, setTriageSubTab] = useState<"queue" | "archive">(
    "queue",
  );

  // Swipe-to-complete state (UI-008)
  const [swipedTaskId, setSwipedTaskId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const handleTouchStart = (taskId: string, e: TouchEvent | MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    touchStartXRef.current = clientX;
    touchStartYRef.current = clientY;
    isHorizontalSwipeRef.current = null;
    setSwipedTaskId(taskId);
    setSwipeOffset(0);
  };

  const handleTouchMove = (taskId: string, e: TouchEvent | MouseEvent) => {
    if (swipedTaskId !== taskId) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - touchStartXRef.current;
    const deltaY = clientY - touchStartYRef.current;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Only permit swipe to the right for complete
      if (deltaX > 0) {
        setSwipeOffset(Math.min(deltaX, 140));
      } else {
        setSwipeOffset(0);
      }
    }
  };

  const handleTouchEnd = (taskId: string) => {
    if (swipedTaskId === taskId) {
      if (swipeOffset >= 75) {
        // Complete threshold reached
        onCompleteTask(taskId);
      }
      setSwipedTaskId(null);
      setSwipeOffset(0);
      isHorizontalSwipeRef.current = null;
    }
  };

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const selectedDateStr = useMemo(
    () => formatDateToYMD(selectedDate),
    [selectedDate],
  );

  // Compute 7 days for the date strip (centered around current week or selected date)
  const weekStrip = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));

    const days: {
      date: Date;
      dateStr: string;
      dayLabel: string;
      dayNum: number;
    }[] = [];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      days.push({
        date: cur,
        dateStr: formatDateToYMD(cur),
        dayLabel: dayLabels[i],
        dayNum: cur.getDate(),
      });
    }
    return days;
  }, [selectedDate]);

  // Calendar agenda tasks for selected date
  const agendaTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === "done") return false;
      const isAction = t.action_date === selectedDateStr;
      const isDue = t.due_date === selectedDateStr;
      if (calendarFilter === "action") return isAction;
      if (calendarFilter === "due") return isDue;
      return isAction || isDue;
    });
  }, [tasks, selectedDateStr, calendarFilter]);

  // Reorder projects helper
  const handleMoveProject = (projectId: string, direction: "up" | "down") => {
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= projects.length) return;
    const reordered = [...projects];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    onReorderProjects(reordered.map((p) => p.id));
  };

  // Render a mobile task card with Swipe-to-Complete (UI-008)
  const renderMobileCard = (task: Task) => {
    const proj = task.project_id ? projectMap.get(task.project_id) : null;
    const prio = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.week;
    const isMinimal = density === "minimal";
    const isSwipingThis = swipedTaskId === task.id;
    const currentOffset = isSwipingThis ? swipeOffset : 0;
    const isReadyToComplete = currentOffset >= 75;

    const cardContent = isMinimal ? (
      <div
        className="rounded-lg bg-[#1C2224] border border-[#2A3235] px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors hover:border-gray-500 w-full"
        style={{
          transform:
            currentOffset > 0 ? `translateX(${currentOffset}px)` : "none",
          transition: isSwipingThis ? "none" : "transform 0.2s ease-out",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            aria-label="Complete task"
            data-testid="complete-task-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCompleteTask(task.id);
            }}
            className="w-4 h-4 rounded-full border border-emerald-500/50 hover:bg-emerald-500/20 shrink-0"
          />
          <button
            type="button"
            onClick={() => onSelectTask(task)}
            className="text-left text-xs font-medium text-gray-100 truncate hover:text-emerald-400"
          >
            {task.title}
          </button>
          {task.status === "tracking" && task.waiting_on && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate shrink-0">
              ⏳ {task.waiting_on}
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="mobile-task-status-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setActionSheetTask(task);
          }}
          className="text-xs px-1.5 py-0.5 rounded bg-[#121718] text-emerald-400 border border-[#2A3235] shrink-0 font-medium hover:border-emerald-500/40"
        >
          {STATUS_LABELS[task.status]} ▾
        </button>
      </div>
    ) : (
      <div
        className="rounded-xl bg-[#1C2224] border border-[#2A3235] p-3 flex flex-col gap-2 transition-colors hover:border-gray-500 w-full"
        style={{
          transform:
            currentOffset > 0 ? `translateX(${currentOffset}px)` : "none",
          transition: isSwipingThis ? "none" : "transform 0.2s ease-out",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              aria-label="Complete task"
              data-testid="complete-task-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCompleteTask(task.id);
              }}
              className="mt-0.5 w-4 h-4 rounded-full border border-emerald-500/50 hover:bg-emerald-500/20 shrink-0"
            />
            <button
              type="button"
              onClick={() => onSelectTask(task)}
              className="text-left text-xs font-semibold text-gray-100 leading-snug hover:text-emerald-400"
            >
              {task.title}
            </button>
          </div>
          <button
            type="button"
            data-testid="mobile-task-status-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setActionSheetTask(task);
            }}
            className="text-xs px-2 py-0.5 rounded-lg bg-[#121718] text-emerald-400 border border-emerald-500/30 shrink-0 font-medium hover:border-emerald-500"
          >
            {STATUS_LABELS[task.status]} ▾
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-gray-400">
          {proj && (
            <span className="flex items-center gap-1 font-medium text-gray-300">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: proj.color }}
              />
              {proj.name}
            </span>
          )}
          <span
            className={`px-1.5 py-0.2 rounded border text-xs ${prio.badge}`}
          >
            {prio.label}
          </span>
          {task.action_date && (
            <span className="text-emerald-400 font-medium">
              ▶ {task.action_date}
            </span>
          )}
          {task.due_date && (
            <span className="text-rose-400 font-medium">⚑ {task.due_date}</span>
          )}
          {task.status === "tracking" && task.waiting_on && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              ⏳ {task.waiting_on}
            </span>
          )}
        </div>
      </div>
    );

    return (
      <div
        key={task.id}
        data-testid={`mobile-task-card-${task.id}`}
        className="relative overflow-hidden rounded-xl select-none"
        onTouchStart={(e) => handleTouchStart(task.id, e)}
        onTouchMove={(e) => handleTouchMove(task.id, e)}
        onTouchEnd={() => handleTouchEnd(task.id)}
        onMouseDown={(e) => handleTouchStart(task.id, e)}
        onMouseMove={(e) => handleTouchMove(task.id, e)}
        onMouseUp={() => handleTouchEnd(task.id)}
      >
        {/* Swipe Reveal Background */}
        <div
          className={`absolute inset-0 flex items-center px-4 rounded-xl font-bold text-xs pointer-events-none transition-colors ${
            isReadyToComplete
              ? "bg-emerald-500 text-black"
              : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-sm">✓</span> Done
          </span>
        </div>

        <div className="relative z-10 w-full">{cardContent}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 pb-16 md:hidden">
      {/* 1. COCKPIT TAB (Default Execution Screen) */}
      {currentTab === "cockpit" && (
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
                  {tasks.filter((t) => t.status === "in_progress_today").length}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {tasks.filter((t) => t.status === "in_progress_today").length ===
              0 ? (
                <div className="text-xs text-gray-400 italic py-3 text-center">
                  No active tasks in Today focus plate. Tap ▾ on any task to
                  move here.
                </div>
              ) : (
                tasks
                  .filter((t) => t.status === "in_progress_today")
                  .map((task) => renderMobileCard(task))
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
                  {tasks.filter((t) => t.status === "tracking").length}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {tasks.filter((t) => t.status === "tracking").length === 0 ? (
                <div className="text-xs text-gray-400 italic py-2 text-center">
                  No tasks currently blocked or waiting on external
                  dependencies.
                </div>
              ) : (
                tasks
                  .filter((t) => t.status === "tracking")
                  .map((task) => renderMobileCard(task))
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
                  {tasks.filter((t) => t.status === "in_progress_week").length}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {weekOpen ? "▴" : "▾"}
              </span>
            </button>
            {weekOpen && (
              <div className="mt-2.5 space-y-2">
                {tasks.filter((t) => t.status === "in_progress_week").length ===
                0 ? (
                  <div className="text-xs text-gray-400 italic py-2 text-center">
                    No tasks assigned to This Week horizon.
                  </div>
                ) : (
                  tasks
                    .filter((t) => t.status === "in_progress_week")
                    .map((task) => renderMobileCard(task))
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
                  {tasks.filter((t) => t.status === "in_progress_month").length}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {monthOpen ? "▴" : "▾"}
              </span>
            </button>
            {monthOpen && (
              <div className="mt-2.5 space-y-2">
                {tasks.filter((t) => t.status === "in_progress_month")
                  .length === 0 ? (
                  <div className="text-xs text-gray-400 italic py-2 text-center">
                    No tasks assigned to This Month horizon.
                  </div>
                ) : (
                  tasks
                    .filter((t) => t.status === "in_progress_month")
                    .map((task) => renderMobileCard(task))
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 2. PODS TAB (Project Swimlanes Screen) */}
      {currentTab === "pods" && (
        <div
          data-testid="mobile-pods-view"
          className="flex-1 p-3 space-y-3 overflow-y-auto"
        >
          {/* Project Filter Chips & Reorder Trigger */}
          <div className="flex items-center justify-between gap-2">
            <div
              data-testid="mobile-project-filters"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
            >
              <button
                type="button"
                onClick={() => setSelectedProjectId("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedProjectId === "all"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                    : "bg-[#1C2224] text-gray-400 border border-[#2A3235]"
                }`}
              >
                All Pods ({swimlanes.length})
              </button>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedProjectId === proj.id
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                      : "bg-[#1C2224] text-gray-400 border border-[#2A3235]"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: proj.color }}
                  />
                  {proj.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenReorderModal}
              className="px-2 py-1 rounded-lg bg-[#1C2224] text-emerald-400 border border-[#2A3235] text-xs font-medium shrink-0 hover:border-emerald-500/40"
            >
              ⇅ Reorder
            </button>
          </div>

          {/* Project Swimlane Pods */}
          <div className="space-y-3">
            {swimlanes
              .filter((lane) =>
                selectedProjectId === "all"
                  ? true
                  : (lane.project?.id || "unassigned") === selectedProjectId,
              )
              .map((lane) => {
                const podId = lane.project?.id || "unassigned";
                const isCollapsed = collapsedPods[podId] ?? false;
                const activeFilter = podStatusFilter[podId] || "all";
                const filteredTasks = lane.tasks.filter((t) =>
                  activeFilter === "all" ? true : t.status === activeFilter,
                );

                return (
                  <div
                    key={podId}
                    data-testid={`mobile-swimlane-pod-${podId}`}
                    className="rounded-2xl bg-[#121718] border border-[#2A3235] p-3 shadow-sm"
                  >
                    {/* Pod Header */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedPods((prev) => ({
                            ...prev,
                            [podId]: !isCollapsed,
                          }))
                        }
                        className="flex items-center gap-2 text-left"
                      >
                        <span className="text-xs text-gray-400">
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {lane.project ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: lane.project.color }}
                          />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-stone-500" />
                        )}
                        <span className="text-xs font-bold text-white">
                          {lane.project
                            ? lane.project.name
                            : "Unassigned Tasks"}
                        </span>
                        <span className="text-xs px-1.5 py-0.2 rounded-full bg-[#1C2224] text-gray-300 border border-[#2A3235]">
                          {lane.tasks.length}
                        </span>
                      </button>

                      {/* Reorder Buttons */}
                      {lane.project && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid="mobile-pod-move-up"
                            aria-label="Move project pod up"
                            onClick={() =>
                              handleMoveProject(lane.project!.id, "up")
                            }
                            className="px-1.5 py-0.5 rounded bg-[#1C2224] text-gray-400 hover:text-white border border-[#2A3235] text-xs"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            data-testid="mobile-pod-move-down"
                            aria-label="Move project pod down"
                            onClick={() =>
                              handleMoveProject(lane.project!.id, "down")
                            }
                            className="px-1.5 py-0.5 rounded bg-[#1C2224] text-gray-400 hover:text-white border border-[#2A3235] text-xs"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-2 mt-2">
                        {/* Intra-pod horizon filter */}
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 text-xs">
                          {(
                            [
                              "all",
                              "in_progress_today",
                              "in_progress_week",
                              "todo",
                              "tracking",
                            ] as const
                          ).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                setPodStatusFilter((prev) => ({
                                  ...prev,
                                  [podId]: st,
                                }))
                              }
                              className={`px-2 py-0.5 rounded-md text-xs whitespace-nowrap ${
                                activeFilter === st
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
                                  : "bg-[#1C2224] text-gray-400 border border-[#2A3235]"
                              }`}
                            >
                              {st === "all" ? "All" : STATUS_LABELS[st]}
                            </button>
                          ))}
                        </div>

                        {/* Task List */}
                        <div className="space-y-2">
                          {filteredTasks.length === 0 ? (
                            <div className="text-xs text-gray-400 italic py-2 text-center">
                              No tasks in this view.
                            </div>
                          ) : (
                            filteredTasks.map((task) => renderMobileCard(task))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. CALENDAR TAB (7-Day Strip + Agenda Screen) */}
      {currentTab === "calendar" && (
        <div
          data-testid="mobile-calendar-view"
          className="flex-1 p-3 space-y-3 overflow-y-auto"
        >
          {/* Calendar Filter Controls */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">
              {selectedDate.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
            <div className="flex items-center gap-1 text-xs">
              {(["all", "action", "due"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCalendarFilter(mode)}
                  className={`px-2 py-0.5 rounded-md text-xs capitalize ${
                    calendarFilter === mode
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                      : "bg-[#1C2224] text-gray-400 border border-[#2A3235]"
                  }`}
                >
                  {mode === "all"
                    ? "All"
                    : mode === "action"
                      ? "▶ Action"
                      : "⚑ Due"}
                </button>
              ))}
            </div>
          </div>

          {/* 7-Day Date Strip */}
          <div
            data-testid="mobile-calendar-strip"
            className="grid grid-cols-7 gap-1 bg-[#121718] p-1.5 rounded-2xl border border-[#2A3235]"
          >
            {weekStrip.map((item) => {
              const isSelected = item.dateStr === selectedDateStr;
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(item.date)}
                  className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500 font-bold shadow-md shadow-emerald-950"
                      : "bg-[#1C2224] text-gray-400 hover:text-white"
                  }`}
                >
                  <span className="text-xs">{item.dayLabel}</span>
                  <span className="text-xs font-semibold">{item.dayNum}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Date Agenda List */}
          <section
            data-testid="mobile-calendar-agenda"
            className="rounded-2xl bg-[#121718] border border-[#2A3235] p-3 space-y-2"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[#2A3235]">
              <span className="text-xs font-bold text-emerald-400">
                Agenda for {selectedDateStr}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#1C2224] text-gray-300 border border-[#2A3235]">
                {agendaTasks.length} tasks
              </span>
            </div>

            {agendaTasks.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-4 text-center">
                No tasks scheduled for this day. Tap an unscheduled task below
                to schedule here.
              </div>
            ) : (
              agendaTasks.map((task) => renderMobileCard(task))
            )}
          </section>

          {/* Unscheduled Tasks Drawer */}
          <section
            data-testid="mobile-unscheduled-tray"
            className="rounded-2xl bg-[#121718] border border-dashed border-[#2A3235] p-3"
          >
            <button
              type="button"
              onClick={() => setUnscheduledDrawerOpen(!unscheduledDrawerOpen)}
              className="w-full flex items-center justify-between pb-1.5 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-200">
                  📌 Unscheduled Tasks
                </span>
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-[#1C2224] text-emerald-400 border border-[#2A3235]">
                  {unscheduledTasks.length}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {unscheduledDrawerOpen ? "▴" : "▾"}
              </span>
            </button>

            {unscheduledDrawerOpen && (
              <div className="space-y-2 mt-2">
                {unscheduledTasks.length === 0 ? (
                  <div className="text-xs text-gray-400 italic py-2 text-center">
                    All tasks are scheduled!
                  </div>
                ) : (
                  unscheduledTasks.map((t) => (
                    <div
                      key={t.id}
                      data-testid={`mobile-unscheduled-task-${t.id}`}
                      className="rounded-xl bg-[#1C2224] border border-[#2A3235] p-2.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-medium text-gray-200 truncate">
                        {t.title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid="mobile-schedule-action-btn"
                          onClick={() =>
                            onScheduleTask(t.id, selectedDateStr, "action")
                          }
                          className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30"
                        >
                          + ▶ Action
                        </button>
                        <button
                          type="button"
                          data-testid="mobile-schedule-due-btn"
                          onClick={() =>
                            onScheduleTask(t.id, selectedDateStr, "due")
                          }
                          className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/20"
                        >
                          + ⚑ Due
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 4. TRIAGE TAB (Inbox Queue & Completed Archive Screen) */}
      {currentTab === "triage" && (
        <div
          data-testid="mobile-triage-view"
          className="flex-1 p-3 space-y-3 overflow-y-auto"
        >
          {/* Segmented Switcher */}
          <div className="grid grid-cols-2 gap-1 bg-[#121718] p-1 rounded-xl border border-[#2A3235]">
            <button
              type="button"
              onClick={() => setTriageSubTab("queue")}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                triageSubTab === "queue"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              📥 Triage / Todo (
              {
                tasks.filter(
                  (t) => t.status === "triage" || t.status === "todo",
                ).length
              }
              )
            </button>
            <button
              type="button"
              onClick={() => setTriageSubTab("archive")}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                triageSubTab === "archive"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              ✓ Completed ({completedTasks.length})
            </button>
          </div>

          {triageSubTab === "queue" ? (
            <div className="space-y-2">
              {tasks.filter((t) => t.status === "triage" || t.status === "todo")
                .length === 0 ? (
                <div className="text-xs text-gray-400 italic py-6 text-center">
                  Inbox zero! No tasks awaiting triage or todo.
                </div>
              ) : (
                tasks
                  .filter((t) => t.status === "triage" || t.status === "todo")
                  .map((task) => renderMobileCard(task))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {completedTasks.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-6 text-center">
                  No completed tasks archived yet.
                </div>
              ) : (
                completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl bg-[#1C2224] border border-[#2A3235] p-3 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-gray-400 line-through truncate leading-snug">
                      {task.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRestoreTask(task.id)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 shrink-0"
                    >
                      ↺ Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ONE-THUMB BOTTOM ACTION SHEET */}
      {actionSheetTask && (
        <div
          data-testid="mobile-action-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setActionSheetTask(null)}
        >
          <div
            className="w-full bg-[#121718] border-t-2 border-emerald-500/50 rounded-t-2xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-8 h-1 bg-gray-600 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-[#2A3235]">
              <div>
                <p className="text-xs text-emerald-400 font-semibold">
                  Quick Move Status
                </p>
                <h4 className="text-xs font-bold text-white truncate max-w-[240px]">
                  {actionSheetTask.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  onCompleteTask(actionSheetTask.id);
                  setActionSheetTask(null);
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
                        onMoveTask(
                          actionSheetTask.id,
                          st,
                          actionSheetTask.project_id,
                        );
                      } else {
                        onUpdateTaskStatus(actionSheetTask.id, st);
                      }
                      setActionSheetTask(null);
                    }}
                    className={`p-2 rounded-lg text-xs font-medium text-center border transition-all ${
                      actionSheetTask.status === st
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
                        onMoveTask(
                          actionSheetTask.id,
                          actionSheetTask.status,
                          null,
                        );
                      }
                      setActionSheetTask(null);
                    }}
                    className={`px-2 py-1 rounded-lg border text-xs whitespace-nowrap ${
                      actionSheetTask.project_id === null
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
                          onMoveTask(
                            actionSheetTask.id,
                            actionSheetTask.status,
                            p.id,
                          );
                        }
                        setActionSheetTask(null);
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs whitespace-nowrap ${
                        actionSheetTask.project_id === p.id
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
      )}

      {/* STICKY BOTTOM NAVIGATION DOCK (4 TABS) */}
      <nav
        data-testid="mobile-bottom-dock"
        aria-label="Mobile Navigation Dock"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#121718]/95 backdrop-blur-md border-t border-[#2A3235] px-2 py-2 grid grid-cols-4 text-center text-xs"
      >
        <button
          type="button"
          data-testid="mobile-tab-cockpit"
          onClick={() => onTabChange("cockpit")}
          className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
            currentTab === "cockpit"
              ? "text-emerald-400 font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span className="text-base leading-none">⚡</span>
          <span className="text-xs mt-0.5">Cockpit</span>
        </button>

        <button
          type="button"
          data-testid="mobile-tab-pods"
          onClick={() => onTabChange("pods")}
          className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
            currentTab === "pods"
              ? "text-emerald-400 font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span className="text-base leading-none">📋</span>
          <span className="text-xs mt-0.5">Pods</span>
        </button>

        <button
          type="button"
          data-testid="mobile-tab-calendar"
          onClick={() => onTabChange("calendar")}
          className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
            currentTab === "calendar"
              ? "text-emerald-400 font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span className="text-base leading-none">📅</span>
          <span className="text-xs mt-0.5">7-Day</span>
        </button>

        <button
          type="button"
          data-testid="mobile-tab-triage"
          onClick={() => onTabChange("triage")}
          className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
            currentTab === "triage"
              ? "text-emerald-400 font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span className="text-base leading-none">📥</span>
          <span className="text-xs mt-0.5">Triage</span>
        </button>
      </nav>
    </div>
  );
}
