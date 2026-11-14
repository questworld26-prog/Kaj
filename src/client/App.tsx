// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-003]
// [spec: UI-004]
// [spec: UI-006]
// [spec: UI-007]
// [spec: UI-009]
// [spec: UI-011]
// [spec: UI-013]
import { h } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import {
  DEFAULT_DONE_RETENTION_DAYS,
  HIDE_REPEATING_TRIAGE_STORAGE_KEY,
  shouldShowTaskInBoardOrTriage,
  type Task,
  type Project,
  type SwimlaneGroup,
  type CalendarEvent,
  type TaskStatus,
  type TelemetrySummary,
  type PurgeCompletedResult,
} from "../shared/types.js";
import * as api from "./api.js";
import { TopBar, type CardDensity } from "./components/TopBar.js";
import { SwimlaneBoard } from "./components/SwimlaneBoard.js";
import { CalendarView } from "./components/CalendarView.js";
import { DesktopCockpit } from "./components/DesktopCockpit.js";
import { MobileViews, type MobileTab } from "./components/MobileViews.js";
import { TaskModal } from "./components/TaskModal.js";
import { CompletedDrawer } from "./components/CompletedDrawer.js";
import { ProjectReorderModal } from "./components/ProjectReorderModal.js";

function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function App() {
  const [currentView, setCurrentView] = useState<
    "cockpit" | "board" | "calendar"
  >("board");
  const [mobileTab, setMobileTab] = useState<MobileTab>("cockpit");
  const [searchQuery, setSearchQuery] = useState("");
  const [cardDensity, setCardDensity] = useState<CardDensity>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("kaj_card_density") as CardDensity;
      if (stored === "compact" || stored === "minimal") {
        return stored;
      }
      if (window.innerWidth < 768) {
        return "minimal";
      }
    }
    return "compact";
  });

  const [hideRepeatingTriage, setHideRepeatingTriage] = useState<boolean>(
    () => {
      if (typeof window !== "undefined") {
        return (
          localStorage.getItem(HIDE_REPEATING_TRIAGE_STORAGE_KEY) === "true"
        );
      }
      return false;
    },
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [swimlanes, setSwimlanes] = useState<SwimlaneGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [unscheduledTasks, setUnscheduledTasks] = useState<Task[]>([]);
  const [vipUsers, setVipUsers] = useState<string[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [memoryMb, setMemoryMb] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calendarRange, setCalendarRange] = useState<{
    start: string;
    end: string;
  } | null>(null);

  // Modal / Drawer visibility
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [defaultActionDate, setDefaultActionDate] = useState<string | null>(
    null,
  );
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isReorderOpen, setIsReorderOpen] = useState(false);

  // Reload all state
  const loadData = useCallback(async () => {
    try {
      const [projs, board, allTasks, completed, tel, unscheduled, vips] =
        await Promise.all([
          api.getProjects(),
          api.getBoard(),
          api.getTasks(),
          api.getCompleted(),
          api.getTelemetry(),
          api.getUnscheduled(),
          api.getVipUsers(),
        ]);

      setProjects(projs);
      setSwimlanes(board);
      setTasks(allTasks);
      setCompletedTasks(completed);
      setTelemetry(tel);
      setUnscheduledTasks(unscheduled);
      setVipUsers(vips);


      // Load calendar events for current window
      let start: string;
      let end: string;
      if (calendarRange) {
        start = calendarRange.start;
        end = calendarRange.end;
      } else {
        const now = new Date();
        start = formatDateToYMD(
          new Date(now.getFullYear(), now.getMonth() - 1, 1),
        );
        end = formatDateToYMD(
          new Date(now.getFullYear(), now.getMonth() + 2, 0),
        );
      }
      const events = await api.getCalendar(start, end);
      setCalendarEvents(events);

      // Query health / memory
      const health = await api.getHealth();
      setMemoryMb(health.memory_rss_mb);
    } catch (err) {
      console.error("Failed to load Kaj app state:", err);
    }
  }, [calendarRange]);

  const handleCalendarRangeChange = useCallback(
    async (start: string, end: string) => {
      setCalendarRange({ start, end });
      try {
        const events = await api.getCalendar(start, end);
        setCalendarEvents(events);
      } catch (err) {
        console.error("Failed to load calendar events for range:", err);
      }
    },
    [],
  );

  useEffect(() => {
    loadData();

    // Subscribe to SSE live push events
    const unsubscribe = api.subscribeToLiveEvents(() => {
      loadData();
    });

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setSelectedTask(null);
        setDefaultActionDate(null);
        setDefaultStatus(null);
        setDefaultProjectId(null);
        setIsTaskModalOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setIsArchiveOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [loadData]);

  // Actions
  const handleOpenAddTask = () => {
    setSelectedTask(null);
    setDefaultActionDate(null);
    setDefaultStatus(null);
    setDefaultProjectId(null);
    setIsTaskModalOpen(true);
  };

  const handleCreateTaskOnDate = (dateStr: string) => {
    setSelectedTask(null);
    setDefaultActionDate(dateStr);
    setDefaultStatus(null);
    setDefaultProjectId(null);
    setIsTaskModalOpen(true);
  };

  const handleCreateTaskInColumn = (
    status: TaskStatus,
    projectId: string | null,
  ) => {
    setSelectedTask(null);
    setDefaultActionDate(null);
    setDefaultStatus(status);
    setDefaultProjectId(projectId);
    setIsTaskModalOpen(true);
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setDefaultActionDate(null);
    setDefaultStatus(null);
    setDefaultProjectId(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    try {
      if (selectedTask) {
        await api.updateTask(selectedTask.id, data);
      } else {
        await api.createTask(data);
      }
      setIsTaskModalOpen(false);
      setSelectedTask(null);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await api.deleteTask(id);
      setIsTaskModalOpen(false);
      setSelectedTask(null);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleUpdateTaskStatus = async (
    taskId: string,
    newStatus: TaskStatus,
  ) => {
    try {
      if (newStatus === "done") {
        await api.completeTask(taskId);
      } else {
        await api.updateTask(taskId, { status: newStatus });
      }
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleMoveTask = async (
    taskId: string,
    newStatus: TaskStatus,
    newProjectId: string | null = null,
  ) => {
    try {
      const updateData: Partial<Task> = {
        status: newStatus,
        project_id: newProjectId,
      };
      if (newStatus === "done") {
        await api.completeTask(taskId);
      } else {
        await api.updateTask(taskId, updateData);
      }
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await api.completeTask(taskId);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleRestoreTask = async (taskId: string) => {
    try {
      await api.reopenTask(taskId);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handlePurgeCompleted = async (): Promise<PurgeCompletedResult | void> => {
    try {
      const result = await api.purgeCompleted();
      await loadData();
      return result;
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleScheduleTask = async (
    taskId: string,
    dateStr: string,
    dateType: "action" | "due" = "action",
  ) => {
    try {
      if (dateType === "due") {
        await api.updateTask(taskId, { due_date: dateStr });
      } else {
        await api.updateTask(taskId, { action_date: dateStr });
      }
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleReorderProjects = async (projectIds: string[]) => {
    try {
      await api.reorderProjects(projectIds);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleCreateProject = async (name: string, color: string) => {
    try {
      await api.createProject(name, color);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDensityChange = (density: CardDensity) => {
    setCardDensity(density);
    if (typeof window !== "undefined") {
      localStorage.setItem("kaj_card_density", density);
    }
  };

  const handleToggleHideRepeatingTriage = useCallback(() => {
    setHideRepeatingTriage((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(HIDE_REPEATING_TRIAGE_STORAGE_KEY, String(next));
      }
      return next;
    });
  }, []);

  // [spec: TASK-006]
  // [spec: UI-005]
  const handleReorderTasks = async (taskIds: string[]) => {
    try {
      setSwimlanes((prevLanes) => {
        const orderMap = new Map(taskIds.map((id, idx) => [id, idx]));
        return prevLanes.map((lane) => ({
          ...lane,
          tasks: [...lane.tasks].sort((a, b) => {
            const ordA = orderMap.has(a.id)
              ? orderMap.get(a.id)!
              : (a.sort_order ?? 9999);
            const ordB = orderMap.has(b.id)
              ? orderMap.get(b.id)!
              : (b.sort_order ?? 9999);
            return ordA - ordB;
          }),
        }));
      });
      await api.reorderTasks(taskIds);
      await loadData();
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  // Filter tasks based on omnipresent search query (UI-007)
  const filterTask = useCallback((task: Task, query: string) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const titleMatch = task.title.toLowerCase().includes(q);
    const detailsMatch = (task.details || "").toLowerCase().includes(q);
    const createdByMatch = (task.created_by || "").toLowerCase().includes(q);
    return titleMatch || detailsMatch || createdByMatch;
  }, []);


  const filteredTasks = useMemo(
    () => tasks.filter((t) => filterTask(t, searchQuery)),
    [tasks, searchQuery, filterTask],
  );

  const hiddenRepeatingTriageCount = useMemo(
    () =>
      filteredTasks.filter(
        (t) => t.status === "triage" && t.repeat_rule !== "none",
      ).length,
    [filteredTasks],
  );

  const filteredSwimlanes = useMemo(
    () =>
      swimlanes.map((lane) => ({
        ...lane,
        tasks: lane.tasks.filter(
          (t) =>
            filterTask(t, searchQuery) &&
            shouldShowTaskInBoardOrTriage(t, hideRepeatingTriage),
        ),
      })),
    [swimlanes, searchQuery, filterTask, hideRepeatingTriage],
  );

  const filteredCompletedTasks = useMemo(
    () => completedTasks.filter((t) => filterTask(t, searchQuery)),
    [completedTasks, searchQuery, filterTask],
  );

  const filteredUnscheduledTasks = useMemo(
    () => unscheduledTasks.filter((t) => filterTask(t, searchQuery)),
    [unscheduledTasks, searchQuery, filterTask],
  );

  const matchingTaskIds = useMemo(
    () => new Set(filteredTasks.map((t) => t.id)),
    [filteredTasks],
  );

  const filteredCalendarEvents = useMemo(() => {
    if (!searchQuery.trim()) return calendarEvents;
    return calendarEvents.filter((ev) => matchingTaskIds.has(ev.task_id));
  }, [calendarEvents, matchingTaskIds, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1111] text-[#F3F4F6]">
      {/* Top Floating Command Bar */}
      <TopBar
        currentView={currentView}
        onViewChange={setCurrentView}
        density={cardDensity}
        onDensityChange={handleDensityChange}
        onAddTask={handleOpenAddTask}
        onOpenArchive={() => setIsArchiveOpen(true)}
        onOpenReorder={() => setIsReorderOpen(true)}
        completedCount={completedTasks.length}
        memoryMb={memoryMb}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col w-full">
        {/* Mobile Layout (< md) */}
        <MobileViews
          currentTab={mobileTab}
          onTabChange={setMobileTab}
          swimlanes={filteredSwimlanes}
          tasks={filteredTasks}
          projects={projects}
          completedTasks={filteredCompletedTasks}
          unscheduledTasks={filteredUnscheduledTasks}
          calendarEvents={filteredCalendarEvents}
          density={cardDensity}
          hideRepeatingTriage={hideRepeatingTriage}
          hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
          onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
          onSelectTask={handleSelectTask}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onMoveTask={handleMoveTask}
          onCompleteTask={handleCompleteTask}
          onRestoreTask={handleRestoreTask}
          onScheduleTask={handleScheduleTask}
          onReorderProjects={handleReorderProjects}
          onOpenReorderModal={() => setIsReorderOpen(true)}
          onCreateTaskOnDate={handleCreateTaskOnDate}
          onCreateTaskInColumn={handleCreateTaskInColumn}
        />

        {/* Desktop Layout (>= md) */}
        <div className="hidden md:flex flex-1 flex-col w-full">
          {currentView === "cockpit" ? (
            <DesktopCockpit
              tasks={filteredTasks}
              projects={projects}
              completedTasks={filteredCompletedTasks}
              telemetry={searchQuery.trim() ? null : telemetry}
              vipUsers={vipUsers}
              hideRepeatingTriage={hideRepeatingTriage}
              hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
              onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
              onSelectTask={handleSelectTask}
              onCompleteTask={handleCompleteTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onAddTask={() => setIsTaskModalOpen(true)}
            />
          ) : currentView === "board" ? (

            <SwimlaneBoard
              swimlanes={filteredSwimlanes}
              density={cardDensity}
              hideRepeatingTriage={hideRepeatingTriage}
              hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
              onToggleHideRepeatingTriage={handleToggleHideRepeatingTriage}
              onSelectTask={handleSelectTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onMoveTask={handleMoveTask}
              onCompleteTask={handleCompleteTask}
              onReorderTasks={handleReorderTasks}
              onCreateTaskInColumn={handleCreateTaskInColumn}
            />
          ) : (
            <CalendarView
              tasks={filteredTasks}
              calendarEvents={filteredCalendarEvents}
              unscheduledTasks={filteredUnscheduledTasks}
              onSelectTask={handleSelectTask}
              onScheduleTask={handleScheduleTask}
              onRangeChange={handleCalendarRangeChange}
              onCreateTaskOnDate={handleCreateTaskOnDate}
            />
          )}
        </div>
      </main>

      {/* Task Modal (Light-dismiss dialog) */}
      <TaskModal
        isOpen={isTaskModalOpen}
        task={selectedTask}
        projects={projects}
        defaultActionDate={defaultActionDate}
        defaultStatus={defaultStatus}
        defaultProjectId={defaultProjectId}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
          setDefaultActionDate(null);
          setDefaultStatus(null);
          setDefaultProjectId(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        onComplete={handleCompleteTask}
      />

      {/* Completed Archive Drawer */}
      <CompletedDrawer
        isOpen={isArchiveOpen}
        tasks={completedTasks}
        projects={projects}
        retentionDays={telemetry?.retention_days ?? DEFAULT_DONE_RETENTION_DAYS}
        onClose={() => setIsArchiveOpen(false)}
        onRestoreTask={handleRestoreTask}
        onPurgeExpired={handlePurgeCompleted}
      />

      {/* Project Swimlane Reorder & Creation Modal */}
      <ProjectReorderModal
        isOpen={isReorderOpen}
        projects={projects}
        onClose={() => setIsReorderOpen(false)}
        onReorder={handleReorderProjects}
        onCreateProject={handleCreateProject}
      />

      {/* Non-blocking Accessible Error Notification Toast */}
      {errorMessage && (
        <div
          data-testid="error-toast"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#241315] border border-rose-700/80 text-rose-200 text-xs shadow-2xl backdrop-blur-md transition-all"
        >
          <span className="font-bold text-rose-400">Error:</span>
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-rose-400 hover:text-white font-bold p-1 rounded hover:bg-rose-900/50"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
