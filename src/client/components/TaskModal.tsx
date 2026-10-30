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

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Work & Tech": [
    "🚀", "🐛", "📝", "⚡", "🎯", "📦", "🔍", "💡", "📅", "🔔", "🎨", "🧪",
    "🔐", "⚙️", "🔥", "✅", "🛠️", "💬", "✨", "📊", "🌐", "💻", "🧹", "📌",
    "📁", "📂", "📈", "📉", "📱", "🖥️", "⌨️", "📧", "📫", "🏷️", "💳", "💰"
  ],
  "Status & Focus": [
    "🔴", "🟡", "🟢", "⭐", "🏆", "⏳", "🛑", "⚠️", "🚨", "🚩", "❓", "❗",
    "💤", "💎", "💥", "🚧", "💯", "🔝", "🆗", "🆕", "🔒", "🔑", "📎", "📖"
  ],
  "Team & Life": [
    "😀", "😎", "🤔", "🙌", "👍", "👎", "🤝", "💪", "👀", "🧠", "🧑‍💻", "🕵️",
    "🎉", "☕", "🍕", "🌱", "🧘", "🚲", "✈️", "🏠", "☀️", "🌙", "🎵", "❤️"
  ],
};

// Regex matching common unicode emojis at start of string
const EMOJI_PREFIX_REGEX = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;

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
  const [isEmojiPaletteOpen, setIsEmojiPaletteOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("Work & Tech");
  const [customEmojiInput, setCustomEmojiInput] = useState<string>("");

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
    details: "",
  });

  // Sync state when task prop changes
  useEffect(() => {
    setIsEmojiPaletteOpen(false);
    setCustomEmojiInput("");
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
      details: formData.details || "",
    });
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
          <h3 className="text-base font-bold text-white">
            {task ? "Edit Task" : "New Task"}
          </h3>
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
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <div className="flex items-center gap-2 relative">
              {/* Option B: Emoji Prefix Trigger */}
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

              {/* Categorized Emoji Palette Popover */}
              {isEmojiPaletteOpen && (
                <div
                  data-testid="task-emoji-palette"
                  className="absolute left-0 top-12 z-30 p-3.5 rounded-2xl bg-[#121718] border border-[#2A3235] shadow-2xl shadow-black/90 w-80 backdrop-blur-md space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs text-gray-400 pb-1.5 border-b border-[#2A3235]">
                    <span className="font-semibold text-emerald-400">Choose Icon</span>
                    <button
                      type="button"
                      onClick={() => setIsEmojiPaletteOpen(false)}
                      className="text-gray-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                    {Object.keys(EMOJI_CATEGORIES).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
                          activeCategory === cat
                            ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40"
                            : "bg-[#1C2224] text-gray-400 hover:text-gray-200 border border-[#2A3235]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Emoji Grid */}
                  <div className="grid grid-cols-6 gap-1.5 text-center text-lg max-h-48 overflow-y-auto py-1">
                    {(EMOJI_CATEGORIES[activeCategory] || []).map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        data-emoji={emoji}
                        onClick={() => {
                          const currentTitle = formData.title || "";
                          const match = currentTitle.match(EMOJI_PREFIX_REGEX);
                          let nextTitle: string;
                          if (match) {
                            nextTitle = currentTitle.replace(EMOJI_PREFIX_REGEX, `${emoji} `);
                          } else {
                            nextTitle = currentTitle.trim() ? `${emoji} ${currentTitle.trim()}` : `${emoji} `;
                          }
                          setFormData({ ...formData, title: nextTitle });
                          setIsEmojiPaletteOpen(false);
                        }}
                        className="p-1.5 rounded-lg hover:bg-[#1C2224] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Custom Emoji / Unicode Paste Input */}
                  <div className="pt-2 border-t border-[#2A3235] flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste any emoji..."
                      value={customEmojiInput}
                      onInput={(e) => setCustomEmojiInput((e.target as HTMLInputElement).value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0E1111] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      disabled={!customEmojiInput.trim()}
                      onClick={() => {
                        const trimmed = customEmojiInput.trim();
                        if (!trimmed) return;
                        const currentTitle = formData.title || "";
                        const match = currentTitle.match(EMOJI_PREFIX_REGEX);
                        let nextTitle: string;
                        if (match) {
                          nextTitle = currentTitle.replace(EMOJI_PREFIX_REGEX, `${trimmed} `);
                        } else {
                          nextTitle = currentTitle.trim() ? `${trimmed} ${currentTitle.trim()}` : `${trimmed} `;
                        }
                        setFormData({ ...formData, title: nextTitle });
                        setCustomEmojiInput("");
                        setIsEmojiPaletteOpen(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
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

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Recurrence Rule
              </label>
              <select
                name="repeat_rule"
                value={formData.repeat_rule}
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement)
                    .value as RecurrenceRule;
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
                className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="none">No Repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          {/* Conditional Recurrence Day Option (AC-TASK-002.3) */}
          {formData.repeat_rule === "weekly" && (
            <div className="p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
              <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                Repeat on Day of the Week
              </label>
              <div className="grid grid-cols-7 gap-1">
                {[
                  { label: "Sun", day: 0 },
                  { label: "Mon", day: 1 },
                  { label: "Tue", day: 2 },
                  { label: "Wed", day: 3 },
                  { label: "Thu", day: 4 },
                  { label: "Fri", day: 5 },
                  { label: "Sat", day: 6 },
                ].map(({ label, day }) => {
                  const isSelected =
                    formData.repeat_day_of_week === day ||
                    (formData.repeat_day_of_week === null &&
                      formData.action_date &&
                      new Date(formData.action_date).getUTCDay() === day);
                  return (
                    <button
                      key={day}
                      type="button"
                      data-testid={`repeat-dow-${day}`}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          repeat_day_of_week: day,
                        })
                      }
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        isSelected
                          ? "bg-emerald-500 text-black font-bold"
                          : "bg-[#1C2224] text-gray-300 hover:text-white hover:bg-[#252D30]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {formData.repeat_rule === "monthly" && (
            <div className="p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
              <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                Repeat on Day of the Month (1 – 31)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="31"
                  name="repeat_day_of_month"
                  data-testid="repeat-dom-input"
                  value={formData.repeat_day_of_month ?? ""}
                  placeholder={
                    formData.action_date
                      ? formData.action_date.split("-")[2]
                      : "1"
                  }
                  onChange={(e) => {
                    const val = parseInt(
                      (e.target as HTMLInputElement).value,
                      10,
                    );
                    setFormData({
                      ...formData,
                      repeat_day_of_month:
                        isNaN(val) || val < 1 || val > 31 ? null : val,
                    });
                  }}
                  className="w-24 px-3 py-1.5 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">
                  Day of every month (e.g. 1st, 15th, 31st with month-end
                  clamping)
                </span>
              </div>
            </div>
          )}

          {formData.repeat_rule === "yearly" && (
            <div className="p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
              <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                Repeat on Day of the Year
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  name="repeat_day_of_year_picker"
                  data-testid="repeat-doy-picker"
                  value={
                    formData.repeat_day_of_year
                      ? `2026-${formData.repeat_day_of_year}`
                      : formData.action_date || "2026-01-01"
                  }
                  onChange={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                      setFormData({
                        ...formData,
                        repeat_day_of_year: val.slice(5),
                      });
                    }
                  }}
                  className="w-40 px-3 py-1.5 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-xs text-gray-400">
                  Recurs annually on this month and day (
                  {formData.repeat_day_of_year ||
                    (formData.action_date
                      ? formData.action_date.slice(5)
                      : "MM-DD")}
                  )
                </span>
              </div>
            </div>
          )}

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

          {/* Details / Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Task Details & Notes
            </label>
            <textarea
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
