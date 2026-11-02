// [spec: UI-009]
import { h } from "preact";
import { useMemo } from "preact/hooks";
import type { Task, Project, TaskStatus } from "../../shared/types.js";
import { CockpitExecutionDeck } from "./cockpit/CockpitExecutionDeck.js";
import { CockpitTelemetryDeck } from "./cockpit/CockpitTelemetryDeck.js";

interface DesktopCockpitProps {
  tasks: Task[];
  projects: Project[];
  completedTasks: Task[];
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onAddTask: () => void;
}

export function DesktopCockpit({
  tasks,
  projects,
  completedTasks,
  onSelectTask,
  onCompleteTask,
  onUpdateTaskStatus,
  onAddTask,
}: DesktopCockpitProps) {
  // Today Focus tasks
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.status === "in_progress_today"),
    [tasks],
  );

  // Tracking tasks
  const trackingTasks = useMemo(
    () => tasks.filter((t) => t.status === "tracking"),
    [tasks],
  );

  // Upcoming This Week & Month tasks
  const upcomingTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status === "in_progress_week" || t.status === "in_progress_month",
      ),
    [tasks],
  );

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  return (
    <div
      data-testid="desktop-cockpit-view"
      className="w-full flex-1 p-6 max-w-[1600px] mx-auto space-y-6 overflow-y-auto"
    >
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* LEFT 7 COLS: Action & Execution Focus Deck */}
        <CockpitExecutionDeck
          todayTasks={todayTasks}
          trackingTasks={trackingTasks}
          upcomingTasks={upcomingTasks}
          projectMap={projectMap}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onUpdateTaskStatus={onUpdateTaskStatus}
          onAddTask={onAddTask}
        />

        {/* RIGHT 5 COLS: Vertical Analytics & Telemetry Stack */}
        <CockpitTelemetryDeck
          completedTasks={completedTasks}
          projects={projects}
        />
      </div>
    </div>
  );
}
