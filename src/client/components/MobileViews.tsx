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
import type { MobileTab } from "./mobile/types.js";
import { MobileCockpitTab } from "./mobile/MobileCockpitTab.js";
import { MobilePodsTab } from "./mobile/MobilePodsTab.js";
import { MobileCalendarTab } from "./mobile/MobileCalendarTab.js";
import { MobileTriageTab } from "./mobile/MobileTriageTab.js";
import { MobileActionSheet } from "./mobile/MobileActionSheet.js";
import { MobileBottomDock } from "./mobile/MobileBottomDock.js";

export type { MobileTab };

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
  onCreateTaskOnDate?: (dateStr: string) => void;
  onCreateTaskInColumn?: (status: TaskStatus, projectId: string | null) => void;
}

export function MobileViews({
  currentTab,
  onTabChange,
  swimlanes,
  tasks,
  projects,
  completedTasks,
  unscheduledTasks,
  density,
  onSelectTask,
  onUpdateTaskStatus,
  onMoveTask,
  onCompleteTask,
  onRestoreTask,
  onScheduleTask,
  onReorderProjects,
  onOpenReorderModal,
  onCreateTaskOnDate,
  onCreateTaskInColumn,
}: MobileViewsProps) {
  // Action sheet state
  const [actionSheetTask, setActionSheetTask] = useState<Task | null>(null);

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

  return (
    <div className="flex flex-col flex-1 pb-16 md:hidden">
      {/* 1. COCKPIT TAB */}
      {currentTab === "cockpit" && (
        <MobileCockpitTab
          tasks={tasks}
          projectMap={projectMap}
          density={density}
          swipedTaskId={swipedTaskId}
          swipeOffset={swipeOffset}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onOpenActionSheet={setActionSheetTask}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      )}

      {/* 2. PODS TAB */}
      {currentTab === "pods" && (
        <MobilePodsTab
          swimlanes={swimlanes}
          projects={projects}
          projectMap={projectMap}
          density={density}
          swipedTaskId={swipedTaskId}
          swipeOffset={swipeOffset}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onOpenActionSheet={setActionSheetTask}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onReorderProjects={onReorderProjects}
          onOpenReorderModal={onOpenReorderModal}
          onCreateTaskInColumn={onCreateTaskInColumn}
        />
      )}

      {/* 3. CALENDAR TAB */}
      {currentTab === "calendar" && (
        <MobileCalendarTab
          tasks={tasks}
          unscheduledTasks={unscheduledTasks}
          projectMap={projectMap}
          density={density}
          swipedTaskId={swipedTaskId}
          swipeOffset={swipeOffset}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onOpenActionSheet={setActionSheetTask}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onScheduleTask={onScheduleTask}
          onCreateTaskOnDate={onCreateTaskOnDate}
        />
      )}

      {/* 4. TRIAGE TAB */}
      {currentTab === "triage" && (
        <MobileTriageTab
          tasks={tasks}
          completedTasks={completedTasks}
          projectMap={projectMap}
          density={density}
          swipedTaskId={swipedTaskId}
          swipeOffset={swipeOffset}
          onSelectTask={onSelectTask}
          onCompleteTask={onCompleteTask}
          onRestoreTask={onRestoreTask}
          onOpenActionSheet={setActionSheetTask}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      )}

      {/* ONE-THUMB BOTTOM ACTION SHEET */}
      <MobileActionSheet
        task={actionSheetTask}
        projects={projects}
        onClose={() => setActionSheetTask(null)}
        onUpdateStatus={onUpdateTaskStatus}
        onMoveTask={onMoveTask}
        onCompleteTask={onCompleteTask}
      />

      {/* STICKY BOTTOM NAVIGATION DOCK (4 TABS) */}
      <MobileBottomDock currentTab={currentTab} onTabChange={onTabChange} />
    </div>
  );
}
