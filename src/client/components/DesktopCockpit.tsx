// [spec: UI-009]
// [spec: UI-011]
// [spec: UI-013]
import { h } from "preact";
import { useMemo } from "preact/hooks";
import {
  shouldShowTaskInBoardOrTriage,
  type Task,
  type Project,
  type TaskStatus,
  type TelemetrySummary,
} from "../../shared/types.js";
import { CockpitExecutionDeck } from "./cockpit/CockpitExecutionDeck.js";
import { CockpitTelemetryDeck } from "./cockpit/CockpitTelemetryDeck.js";

interface DesktopCockpitProps {
  tasks: Task[];
  projects: Project[];
  completedTasks: Task[];
  telemetry?: TelemetrySummary | null;
  vipUsers?: string[];
  hideRepeatingTriage?: boolean;
  hiddenRepeatingTriageCount?: number;
  onToggleHideRepeatingTriage?: () => void;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onAddTask: () => void;
}

export function DesktopCockpit({
  tasks,
  projects,
  completedTasks,
  telemetry = null,
  vipUsers = [],
  hideRepeatingTriage = false,
  hiddenRepeatingTriageCount = 0,
  onToggleHideRepeatingTriage,
  onSelectTask,
  onCompleteTask,
  onUpdateTaskStatus,
  onAddTask,
}: DesktopCockpitProps) {
  // VIP Triage tasks: unassigned triage tasks created by VIP users (UI-009 / AC-UI-009.6)
  const vipTriageTasks = useMemo(() => {
    const vipList = (vipUsers || []).map((u) => u.toLowerCase().trim());
    return tasks.filter((t) => {
      // Must be triage and without project (project_id == null)
      if (t.status !== "triage") return false;
      if (!shouldShowTaskInBoardOrTriage(t, hideRepeatingTriage)) return false;
      if (t.project_id !== null && t.project_id !== undefined && t.project_id !== "") return false;
      if (!t.created_by || !t.created_by.trim()) return false;
      const creator = t.created_by.trim();
      if (/\[vip\]|\(vip\)|\bvip\b/i.test(creator)) return true;
      return vipList.includes(creator.toLowerCase());
    });
  }, [tasks, vipUsers, hideRepeatingTriage]);

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
          vipTriageTasks={vipTriageTasks}
          todayTasks={todayTasks}
          trackingTasks={trackingTasks}
          upcomingTasks={upcomingTasks}
          projectMap={projectMap}
          hideRepeatingTriage={hideRepeatingTriage}
          hiddenRepeatingTriageCount={hiddenRepeatingTriageCount}
          onToggleHideRepeatingTriage={onToggleHideRepeatingTriage}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onUpdateTaskStatus={onUpdateTaskStatus}
          onAddTask={onAddTask}
        />


        {/* RIGHT 5 COLS: Vertical Analytics & Telemetry Stack */}
        <CockpitTelemetryDeck
          completedTasks={completedTasks}
          projects={projects}
          telemetry={telemetry}
        />
      </div>
    </div>
  );
}
