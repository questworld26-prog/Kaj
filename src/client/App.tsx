// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-003]
// [spec: UI-004]
import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import type {
  Task,
  Project,
  SwimlaneGroup,
  CalendarEvent,
  TaskStatus,
} from "../shared/types.js";
import * as api from "./api.js";
import { TopBar } from "./components/TopBar.js";
import { SwimlaneBoard } from "./components/SwimlaneBoard.js";
import { CalendarView } from "./components/CalendarView.js";
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
  const [currentView, setCurrentView] = useState<"board" | "calendar">("board");
  const [projects, setProjects] = useState<Project[]>([]);
  const [swimlanes, setSwimlanes] = useState<SwimlaneGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<Task[]>([]);
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
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isReorderOpen, setIsReorderOpen] = useState(false);

  // Reload all state
  const loadData = useCallback(async () => {
    try {
      const [projs, board, allTasks, completed, unscheduled] =
        await Promise.all([
          api.getProjects(),
          api.getBoard(),
          api.getTasks(),
          api.getCompleted(),
          api.getUnscheduled(),
        ]);

      setProjects(projs);
      setSwimlanes(board);
      setTasks(allTasks);
      setCompletedTasks(completed);
      setUnscheduledTasks(unscheduled);

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
    setIsTaskModalOpen(true);
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1111] text-[#F3F4F6]">
      {/* Top Floating Command Bar */}
      <TopBar
        currentView={currentView}
        onViewChange={setCurrentView}
        onAddTask={handleOpenAddTask}
        onOpenArchive={() => setIsArchiveOpen(true)}
        onOpenReorder={() => setIsReorderOpen(true)}
        completedCount={completedTasks.length}
        memoryMb={memoryMb}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col w-full">
        {currentView === "board" ? (
          <SwimlaneBoard
            swimlanes={swimlanes}
            onSelectTask={handleSelectTask}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onMoveTask={handleMoveTask}
            onCompleteTask={handleCompleteTask}
          />
        ) : (
          <CalendarView
            tasks={tasks}
            calendarEvents={calendarEvents}
            unscheduledTasks={unscheduledTasks}
            onSelectTask={handleSelectTask}
            onScheduleTask={handleScheduleTask}
            onRangeChange={handleCalendarRangeChange}
          />
        )}
      </main>

      {/* Task Modal (Light-dismiss dialog) */}
      <TaskModal
        isOpen={isTaskModalOpen}
        task={selectedTask}
        projects={projects}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      {/* Completed Archive Drawer */}
      <CompletedDrawer
        isOpen={isArchiveOpen}
        tasks={completedTasks}
        projects={projects}
        onClose={() => setIsArchiveOpen(false)}
        onRestoreTask={handleRestoreTask}
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
