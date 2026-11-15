// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-005]
// [spec: UI-010]
// [spec: TASK-006]
import { h } from "preact";
import type {
  SwimlaneGroup,
  Task,
  TaskStatus,
} from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { SwimlaneTaskCard } from "./SwimlaneTaskCard.js";

interface SwimlaneColumnProps {
  lane: SwimlaneGroup;
  colKey: TaskStatus;
  label: string;
  icon?: string;
  isTodayFocus?: boolean;
  density: CardDensity;
  dragOverKey: string | null;
  setDragOverKey: (key: string | null) => void;
  dragOverTaskId: string | null;
  setDragOverTaskId: (id: string | null) => void;
  onSelectTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onMoveTask?: (
    taskId: string,
    newStatus: TaskStatus,
    newProjectId: string | null,
  ) => void;
  onCompleteTask: (taskId: string) => void;
  onReorderTasks?: (taskIds: string[]) => void;
  onCreateTaskInColumn?: (status: TaskStatus, projectId: string | null) => void;
}

export function SwimlaneColumn({
  lane,
  colKey,
  label,
  icon,
  isTodayFocus,
  density,
  dragOverKey,
  setDragOverKey,
  dragOverTaskId,
  setDragOverTaskId,
  onSelectTask,
  onUpdateTaskStatus,
  onMoveTask,
  onCompleteTask,
  onReorderTasks,
  onCreateTaskInColumn,
}: SwimlaneColumnProps) {
  const podId = lane.project?.id || "unassigned";
  const colTasks = lane.tasks.filter((t) => t.status === colKey);
  const cellKey = `${podId}-${colKey}`;
  const isDragOver = dragOverKey === cellKey;
  const isTracking = colKey === "tracking";

  const handleColumnDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    setDragOverTaskId(null);
    const raw =
      e.dataTransfer?.getData("application/kaj-task") ||
      e.dataTransfer?.getData("text/plain");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.taskId) {
        const targetProjectId = lane.project?.id || null;
        if (onMoveTask) {
          onMoveTask(data.taskId, colKey, targetProjectId);
        } else {
          onUpdateTaskStatus(data.taskId, colKey);
        }
        const currentIds = colTasks
          .map((t) => t.id)
          .filter((id) => id !== data.taskId);
        currentIds.push(data.taskId);
        if (onReorderTasks) {
          onReorderTasks(currentIds);
        }
      }
    } catch (err) {
      console.error("Error handling drop on board:", err);
    }
  };

  const handleCardDragOver = (taskId: string, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (dragOverTaskId !== taskId) setDragOverTaskId(taskId);
  };

  const handleCardDragLeave = (taskId: string, e: DragEvent) => {
    e.stopPropagation();
    if (dragOverTaskId === taskId) setDragOverTaskId(null);
  };

  const handleCardDrop = (taskId: string, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTaskId(null);
    setDragOverKey(null);
    const raw =
      e.dataTransfer?.getData("application/kaj-task") ||
      e.dataTransfer?.getData("text/plain");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const draggedId = data.taskId;
      if (!draggedId || draggedId === taskId) return;

      const targetProjectId = lane.project?.id || null;
      if (
        data.sourceStatus !== colKey ||
        data.sourceProjectId !== targetProjectId
      ) {
        if (onMoveTask) onMoveTask(draggedId, colKey, targetProjectId);
        else onUpdateTaskStatus(draggedId, colKey);
      } else {
        const currentIds = colTasks
          .map((t) => t.id)
          .filter((id) => id !== draggedId);
        const targetIdx = currentIds.indexOf(taskId);
        currentIds.splice(targetIdx, 0, draggedId);
        if (onReorderTasks) {
          onReorderTasks(currentIds);
        }
      }
    } catch (err) {
      console.error("Error reordering task:", err);
    }
  };

  return (
    <div
      data-col={colKey}
      data-swimlane={podId}
      {...(isTodayFocus ? { "data-testid": "today-focus-plate" } : {})}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        onCreateTaskInColumn?.(colKey, lane.project?.id || null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (dragOverKey !== cellKey) setDragOverKey(cellKey);
      }}
      onDragLeave={() => {
        if (dragOverKey === cellKey) setDragOverKey(null);
      }}
      onDrop={handleColumnDrop}
      className={`flex flex-col rounded-xl p-2 min-h-[110px] transition-all ${
        isTodayFocus
          ? "bg-emerald-950/20 border border-emerald-500/30 shadow-inner"
          : isTracking
            ? "bg-[#161D1F] border border-[#2A3235]"
            : colKey.startsWith("in_progress")
              ? "bg-[#151D1F] border border-[#2A3235]"
              : "bg-[#161D1F] border border-[#2A3235]"
      } ${
        isDragOver
          ? "ring-2 ring-emerald-400 border-emerald-400 bg-emerald-500/10 shadow-inner"
          : ""
      }`}
    >
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#2A3235]/60 text-xs font-semibold">
        <span
          className={`flex items-center gap-1.5 ${
            isTodayFocus
              ? "text-emerald-300 font-bold"
              : isTracking
                ? "text-amber-300 font-bold"
                : "text-gray-300"
          }`}
        >
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
              isTodayFocus
                ? "bg-emerald-500/30 text-emerald-200"
                : isTracking
                  ? "bg-[#1C2224] text-amber-400"
                  : "bg-[#1C2224] text-gray-400"
            }`}
          >
            {colTasks.length}
          </span>
          {onCreateTaskInColumn && (
            <button
              type="button"
              data-testid="col-add-task-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCreateTaskInColumn(colKey, lane.project?.id || null);
              }}
              className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-emerald-400 hover:bg-[#1C2224] transition-colors text-xs font-bold"
              title={`Add task to ${label} (${lane.project?.name || "Unassigned"})`}
              aria-label={`Add task to ${label}`}
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 flex-1">
        {colTasks.map((task) => (
          <SwimlaneTaskCard
            key={task.id}
            task={task}
            density={density}
            isTracking={isTracking}
            isDraggedOver={dragOverTaskId === task.id}
            onSelectTask={onSelectTask}
            onCompleteTask={onCompleteTask}
            onDragOverCard={handleCardDragOver}
            onDragLeaveCard={handleCardDragLeave}
            onDropCard={handleCardDrop}
          />
        ))}
      </div>
    </div>
  );
}
