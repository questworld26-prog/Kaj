// [spec: UI-004]
// [spec: UI-008]
import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  Task,
  Project,
  TaskStatus,
  PriorityHorizon,
  RecurrenceRule,
} from "../../shared/types.js";
import {
  EmojiPickerPopover,
  EMOJI_PREFIX_REGEX,
} from "./task-modal/EmojiPickerPopover.js";
import { FormatToolbar } from "./task-modal/FormatToolbar.js";
import { RecurrenceFields } from "./task-modal/RecurrenceFields.js";

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null;
  projects: Project[];
  defaultActionDate?: string | null;
  defaultStatus?: TaskStatus | null;
  defaultProjectId?: string | null;
  onClose: () => void;
  onSave: (data: Partial<Task>) => void;
  onDelete?: (id: string) => void;
  onComplete?: (id: string) => void;
}

export function TaskModal({
  isOpen,
  task,
  projects,
  defaultActionDate = null,
  defaultStatus = null,
  defaultProjectId = null,
  onClose,
  onSave,
  onDelete,
  onComplete,
}: TaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEmojiPaletteOpen, setIsEmojiPaletteOpen] = useState(false);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);

  const [formData, setFormData] = useState<Partial<Task>>({
    title: "",
    status: "triage",
    project_id: null,
    priority: "week",
    action_date: null,
    due_date: null,
    repeat_rule: "none",
    repeat_day_of_week: null,
    repeat_day_of_month: null,
    repeat_day_of_year: null,
    waiting_on: "",
    created_by: "",
    details: "",
  });

  // Sync state when task prop changes
  useEffect(() => {
    setIsEmojiPaletteOpen(false);
    setShowFormatToolbar(false);
    if (task) {
      setFormData({
        title: task.title,
        status: task.status,
        project_id: task.project_id,
        priority: task.priority,
        action_date: task.action_date || null,
        due_date: task.due_date || null,
        repeat_rule: task.repeat_rule,
        repeat_day_of_week: task.repeat_day_of_week ?? null,
        repeat_day_of_month: task.repeat_day_of_month ?? null,
        repeat_day_of_year: task.repeat_day_of_year ?? null,
        waiting_on: task.waiting_on || "",
        created_by: task.created_by || "",
        details: task.details || "",
      });
    } else {
      setFormData({
        title: "",
        status: defaultStatus || "todo",
        project_id: defaultProjectId || null,
        priority: "week",
        action_date: defaultActionDate || null,
        due_date: null,
        repeat_rule: "none",
        repeat_day_of_week: null,
        repeat_day_of_month: null,
        repeat_day_of_year: null,
        waiting_on: "",
        created_by: "",
        details: "",
      });
    }
  }, [task, isOpen, defaultActionDate, defaultStatus, defaultProjectId]);

  // Dialog imperative control
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleSubmit = (e: h.JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    if (!formData.title?.trim()) return;

    onSave({
      ...formData,
      title: formData.title.trim(),
      project_id: formData.project_id || null,
      action_date: formData.action_date || null,
      due_date: formData.due_date || null,
      waiting_on: formData.waiting_on || "",
      created_by: formData.created_by?.trim()
        ? formData.created_by.trim()
        : null,
      details: formData.details || "",
    });
  };

  const handleSelectEmoji = (emoji: string) => {
    const currentTitle = formData.title || "";
    const match = currentTitle.match(EMOJI_PREFIX_REGEX);
    let nextTitle: string;
    if (match) {
      nextTitle = currentTitle.replace(EMOJI_PREFIX_REGEX, `${emoji} `);
    } else {
      nextTitle = currentTitle.trim()
        ? `${emoji} ${currentTitle.trim()}`
        : `${emoji} `;
    }
    setFormData({ ...formData, title: nextTitle });
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      id="task-dialog"
      data-testid="task-modal"
      // @ts-expect-error closedby is standard per HTML spec 2025+
      closedby="any"
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto rounded-2xl bg-[#121718] border border-[#2A3235] p-0 shadow-2xl text-gray-100 max-w-xl w-full backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A3235] bg-[#121718]">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-white">
              {task ? "Edit Task" : "New Task"}
            </h3>
            {task?.created_by && (
              <span
                data-testid="modal-creator-badge"
                className="text-[11px] px-2 py-0.5 rounded-full bg-[#1C2224] text-stone-300 border border-[#2A3235] flex items-center gap-1 font-normal"
                title={`Created by: ${task.created_by}`}
              >
                👤 {task.created_by}
              </span>
            )}
          </div>
          <button
            type="button"
            data-testid="close-task-modal-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1C2224] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title with Emoji Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <div className="flex items-center gap-2 relative">
              <button
                type="button"
                data-testid="task-emoji-prefix-btn"
                onClick={() => setIsEmojiPaletteOpen((prev) => !prev)}
                className="w-10 h-10 rounded-xl bg-[#1C2224] border border-[#2A3235] hover:border-emerald-500/50 hover:bg-[#252D30] flex items-center justify-center text-lg transition-colors text-white shrink-0 shadow-sm"
                title="Select emoji icon"
                aria-label="Select emoji icon"
              >
                {(() => {
                  const match = formData.title?.match(EMOJI_PREFIX_REGEX);
                  return match ? match[1] : "✨";
                })()}
              </button>

              <input
                type="text"
                name="title"
                required
                placeholder="e.g. Design system tokens & schema migration"
                value={formData.title}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    title: (e.target as HTMLInputElement).value,
                  })
                }
                className="flex-1 px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />

              <EmojiPickerPopover
                isOpen={isEmojiPaletteOpen}
                onClose={() => setIsEmojiPaletteOpen(false)}
                onSelectEmoji={handleSelectEmoji}
              />
            </div>
          </div>

          {/* Status & Project Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Workflow Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: (e.target as HTMLSelectElement).value as TaskStatus,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="triage">Triage</option>
                <option value="todo">Todo</option>
                <option value="in_progress_today">In Progress: Today</option>
                <option value="in_progress_week">In Progress: This Week</option>
                <option value="in_progress_month">
                  In Progress: This Month
                </option>
                <option value="tracking">Tracking (Blocked / Delivery)</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Project Swimlane
              </label>
              <select
                name="project_id"
                value={formData.project_id || ""}
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  setFormData({
                    ...formData,
                    project_id: val === "" ? null : val,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Unassigned Inbox</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority & Recurrence Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Planning Priority Horizon
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: (e.target as HTMLSelectElement)
                      .value as PriorityHorizon,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="today">Today</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
              </select>
            </div>

            <RecurrenceFields
              repeatRule={formData.repeat_rule || "none"}
              repeatDayOfWeek={formData.repeat_day_of_week ?? null}
              repeatDayOfMonth={formData.repeat_day_of_month ?? null}
              repeatDayOfYear={formData.repeat_day_of_year ?? null}
              actionDate={formData.action_date || null}
              onChangeRule={(val) => {
                setFormData({
                  ...formData,
                  repeat_rule: val,
                  repeat_day_of_week:
                    val === "weekly"
                      ? (formData.repeat_day_of_week ??
                        (formData.action_date
                          ? new Date(formData.action_date).getUTCDay()
                          : 1))
                      : null,
                  repeat_day_of_month:
                    val === "monthly"
                      ? (formData.repeat_day_of_month ??
                        (formData.action_date
                          ? Number(formData.action_date.split("-")[2])
                          : 1))
                      : null,
                  repeat_day_of_year:
                    val === "yearly"
                      ? (formData.repeat_day_of_year ??
                        (formData.action_date
                          ? formData.action_date.slice(5)
                          : "01-01"))
                      : null,
                });
              }}
              onChangeDayOfWeek={(day) =>
                setFormData({ ...formData, repeat_day_of_week: day })
              }
              onChangeDayOfMonth={(dom) =>
                setFormData({ ...formData, repeat_day_of_month: dom })
              }
              onChangeDayOfYear={(doy) =>
                setFormData({ ...formData, repeat_day_of_year: doy })
              }
            />
          </div>

          {/* Dual Date Scheduling */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                ▶ Action Date (When to Work)
              </label>
              <input
                type="date"
                name="action_date"
                data-testid="task-action-date-input"
                value={formData.action_date || ""}
                onChange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  setFormData({
                    ...formData,
                    action_date: val === "" ? null : val,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1.5">
                ⚑ Due Date (Hard Deadline)
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date || ""}
                onChange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  setFormData({
                    ...formData,
                    due_date: val === "" ? null : val,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Waiting on / Blocker Note */}
          <div>
            <label className="block text-xs font-semibold text-amber-400 mb-1.5">
              Tracking / Waiting On Note
            </label>
            <input
              type="text"
              name="waiting_on"
              placeholder="e.g. FedEx 772918390 or Waiting on API token from DevOps"
              value={formData.waiting_on}
              onInput={(e) =>
                setFormData({
                  ...formData,
                  waiting_on: (e.target as HTMLInputElement).value,
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Created By / Origin Attribution */}
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5 flex items-center gap-1.5">
              <span>Created By / Origin</span>
              <span className="text-[10px] text-gray-400 font-normal">
                (Telegram user, team member, or system)
              </span>
            </label>
            <input
              type="text"
              name="created_by"
              placeholder="e.g. Prithi, Alex, or Telegram User"
              value={formData.created_by || ""}
              onInput={(e) =>
                setFormData({
                  ...formData,
                  created_by: (e.target as HTMLInputElement).value,
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Details / Description with Format Toolbar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Task Details & Notes
              </label>
              <button
                type="button"
                data-testid="details-format-toggle-btn"
                onClick={() => setShowFormatToolbar(!showFormatToolbar)}
                title={
                  showFormatToolbar
                    ? "Hide formatting menu"
                    : "Show formatting menu"
                }
                aria-label="Toggle text formatting menu"
                aria-pressed={showFormatToolbar}
                className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border transition-colors ${
                  showFormatToolbar
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : "bg-[#1C2224] text-gray-400 border-[#2A3235] hover:text-gray-200 hover:border-gray-600"
                }`}
              >
                <span className="font-serif font-bold text-xs leading-none">
                  Format
                </span>
                <span className="text-[10px] leading-none opacity-80">
                  {showFormatToolbar ? "▲" : "▼"}
                </span>
              </button>
            </div>

            {showFormatToolbar && (
              <FormatToolbar
                textareaRef={detailsTextareaRef}
                details={formData.details || ""}
                onDetailsChange={(nextDetails) =>
                  setFormData({ ...formData, details: nextDetails })
                }
              />
            )}

            <textarea
              ref={detailsTextareaRef}
              name="details"
              rows={3}
              placeholder="Full markdown notes, links, acceptance criteria..."
              value={formData.details}
              onInput={(e) =>
                setFormData({
                  ...formData,
                  details: (e.target as HTMLTextAreaElement).value,
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#2A3235] bg-[#121718]">
          <div className="flex items-center gap-2">
            {task && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors"
              >
                Delete Task
              </button>
            )}
            {task && task.status !== "done" && onComplete && (
              <button
                type="button"
                data-testid="modal-mark-complete-btn"
                onClick={() => {
                  onComplete(task.id);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
              >
                <span>✓</span> Mark Complete
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="cancel-btn"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white bg-[#1C2224] border border-[#2A3235] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[#0E1111] bg-[#10B981] hover:bg-[#34D399] shadow-md shadow-emerald-950 transition-colors"
            >
              {task ? "Update Task" : "Create Task"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
