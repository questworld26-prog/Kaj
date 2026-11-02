// [spec: UI-006]
// [spec: UI-008]
import { h } from "preact";
import { useState } from "preact/hooks";
import type {
  Task,
  Project,
  SwimlaneGroup,
  TaskStatus,
} from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { MobileTaskCard } from "./MobileTaskCard.js";
import { STATUS_LABELS } from "./types.js";

interface MobilePodsTabProps {
  swimlanes: SwimlaneGroup[];
  projects: Project[];
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
  onReorderProjects: (projectIds: string[]) => void;
  onOpenReorderModal: () => void;
  onCreateTaskInColumn?: (status: TaskStatus, projectId: string | null) => void;
}

export function MobilePodsTab({
  swimlanes,
  projects,
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
  onReorderProjects,
  onOpenReorderModal,
  onCreateTaskInColumn,
}: MobilePodsTabProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | "all">(
    "all",
  );
  const [collapsedPods, setCollapsedPods] = useState<Record<string, boolean>>(
    {},
  );
  const [podStatusFilter, setPodStatusFilter] = useState<
    Record<string, TaskStatus | "all">
  >({});

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

  return (
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
                      {lane.project ? lane.project.name : "Unassigned Tasks"}
                    </span>
                    <span className="text-xs px-1.5 py-0.2 rounded-full bg-[#1C2224] text-gray-300 border border-[#2A3235]">
                      {lane.tasks.length}
                    </span>
                  </button>

                  {/* Reorder Buttons */}
                  <div className="flex items-center gap-1">
                    {onCreateTaskInColumn && (
                      <button
                        type="button"
                        data-testid="mobile-pod-add-task-btn"
                        aria-label={`Add task to ${lane.project ? lane.project.name : "Unassigned"}`}
                        onClick={() =>
                          onCreateTaskInColumn(
                            activeFilter === "all" ? "todo" : activeFilter,
                            lane.project?.id || null,
                          )
                        }
                        className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold"
                      >
                        +
                      </button>
                    )}
                    {lane.project && (
                      <>
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
                      </>
                    )}
                  </div>
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
                        filteredTasks.map((task) => renderCard(task))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
