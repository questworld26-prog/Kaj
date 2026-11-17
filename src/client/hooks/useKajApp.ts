// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-003]
// [spec: UI-004]
// [spec: UI-006]
// [spec: UI-007]
// [spec: UI-009]
// [spec: UI-011]
// [spec: UI-013]
// [spec: TASK-006]
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import {
  HIDE_REPEATING_TRIAGE_STORAGE_KEY,
  shouldShowTaskInBoardOrTriage,
  type Task,
  type Project,
  type SwimlaneGroup,
  type CalendarEvent,
  type TaskStatus,
  type TelemetrySummary,
  type PurgeCompletedResult,
} from "../../shared/types.js";
import * as api from "../api.js";
import type { CardDensity } from "../components/TopBar.js";
import type { MobileTab } from "../components/MobileViews.js";
import { formatDateToYMD } from "../components/calendar/calendar-helpers.js";

export function useKajApp() {
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
  const [defaultCreator, setDefaultCreator] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [memoryMb, setMemoryMb] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calendarRange, setCalendarRange] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [defaultActionDate, setDefaultActionDate] = useState<string | null>(
    null,
  );
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isReorderOpen, setIsReorderOpen] = useState(false);

  const openTaskModal = useCallback(
    (opts: {
      task?: Task | null;
      actionDate?: string | null;
      status?: TaskStatus | null;
      projectId?: string | null;
    } = {}) => {
      setSelectedTask(opts.task ?? null);
      setDefaultActionDate(opts.actionDate ?? null);
      setDefaultStatus(opts.status ?? null);
      setDefaultProjectId(opts.projectId ?? null);
      setIsTaskModalOpen(true);
    },
    [],
  );

  const closeTaskModal = useCallback(() => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
    setDefaultActionDate(null);
    setDefaultStatus(null);
    setDefaultProjectId(null);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [projs, board, allTasks, completed, tel, unscheduled, identity] =
        await Promise.all([
          api.getProjects(),
          api.getBoard(),
          api.getTasks(),
          api.getCompleted(),
          api.getTelemetry(),
          api.getUnscheduled(),
          api.getIdentityInfo(),
        ]);

      setProjects(projs);
      setSwimlanes(board);
      setTasks(allTasks);
      setCompletedTasks(completed);
      setTelemetry(tel);
      setUnscheduledTasks(unscheduled);
      setVipUsers(identity.vip_users);
      setDefaultCreator(identity.default_creator);

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
    const unsubscribe = api.subscribeToLiveEvents(() => {
      loadData();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openTaskModal();
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
  }, [loadData, openTaskModal]);

  const handleOpenAddTask = () => openTaskModal();
  const handleCreateTaskOnDate = (dateStr: string) =>
    openTaskModal({ actionDate: dateStr });
  const handleCreateTaskInColumn = (
    status: TaskStatus,
    projectId: string | null,
  ) => openTaskModal({ status, projectId });
  const handleSelectTask = (task: Task) => openTaskModal({ task });

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
      if (newStatus === "done") {
        await api.completeTask(taskId);
      } else {
        await api.updateTask(taskId, {
          status: newStatus,
          project_id: newProjectId,
        });
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

  return {
    currentView,
    setCurrentView,
    mobileTab,
    setMobileTab,
    searchQuery,
    setSearchQuery,
    cardDensity,
    hideRepeatingTriage,
    projects,
    completedTasks,
    telemetry,
    vipUsers,
    defaultCreator,
    memoryMb,
    errorMessage,
    setErrorMessage,
    isTaskModalOpen,
    setIsTaskModalOpen,
    selectedTask,
    defaultActionDate,
    defaultStatus,
    defaultProjectId,
    isArchiveOpen,
    setIsArchiveOpen,
    isReorderOpen,
    setIsReorderOpen,
    filteredTasks,
    hiddenRepeatingTriageCount,
    filteredSwimlanes,
    filteredCompletedTasks,
    filteredUnscheduledTasks,
    filteredCalendarEvents,
    closeTaskModal,
    handleCalendarRangeChange,
    handleOpenAddTask,
    handleCreateTaskOnDate,
    handleCreateTaskInColumn,
    handleSelectTask,
    handleSaveTask,
    handleDeleteTask,
    handleUpdateTaskStatus,
    handleMoveTask,
    handleCompleteTask,
    handleRestoreTask,
    handlePurgeCompleted,
    handleScheduleTask,
    handleReorderProjects,
    handleCreateProject,
    handleDensityChange,
    handleToggleHideRepeatingTriage,
    handleReorderTasks,
  };
}
