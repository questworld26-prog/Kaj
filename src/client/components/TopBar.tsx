// [spec: UI-001]
// [spec: UI-002]
// [spec: UI-005]
// [spec: UI-006]
// [spec: UI-007]
import { h } from "preact";

export type CardDensity = "compact" | "minimal";

interface TopBarProps {
  currentView: "board" | "calendar";
  onViewChange: (view: "board" | "calendar") => void;
  density: CardDensity;
  onDensityChange: (density: CardDensity) => void;
  onAddTask: () => void;
  onOpenArchive: () => void;
  onOpenReorder: () => void;
  completedCount: number;
  memoryMb?: number;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function TopBar({
  currentView,
  onViewChange,
  density,
  onDensityChange,
  onAddTask,
  onOpenArchive,
  onOpenReorder,
  completedCount,
  memoryMb,
  searchQuery = "",
  onSearchChange = () => {},
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-[#121718]/90 backdrop-blur-md border-b border-[#2A3235] px-4 md:px-6 py-2.5 md:py-3 transition-colors">
      {/* Mobile Top Bar (< md) */}
      <div className="flex md:hidden flex-col gap-2 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shadow-sm shadow-emerald-950">
              ক
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-white">
                Kaj
              </span>
              <span className="text-xs px-1.5 py-0.2 rounded bg-[#1C2224] text-emerald-400 font-medium border border-[#2A3235]">
                কাজ
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="mobile-density-toggle"
              onClick={() =>
                onDensityChange(density === "compact" ? "minimal" : "compact")
              }
              className="px-2 py-1 rounded-lg text-xs font-medium bg-[#1C2224] text-gray-300 border border-[#2A3235] hover:border-gray-500 transition-colors"
              title="Toggle Density"
            >
              {density === "compact" ? "Compact" : "Minimal"}
            </button>
            <button
              type="button"
              data-testid="mobile-add-task-btn"
              onClick={onAddTask}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-[#10B981] hover:bg-[#34D399] text-[#0E1111] shadow-md shadow-emerald-950 transition-colors"
            >
              + Task
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="relative w-full flex items-center">
          <input
            type="text"
            data-testid="mobile-task-search-input"
            value={searchQuery}
            onInput={(e) =>
              onSearchChange((e.target as HTMLInputElement).value)
            }
            placeholder="Search tasks..."
            className="w-full bg-[#0E1111] text-xs text-gray-200 placeholder-gray-500 rounded-xl px-3 py-1.5 pl-8 pr-7 border border-[#2A3235] focus:outline-none focus:border-emerald-500/80 transition-colors"
          />
          <svg
            className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              type="button"
              data-testid="mobile-search-clear-btn"
              onClick={() => onSearchChange("")}
              className="absolute right-2 text-xs text-gray-400 hover:text-white p-0.5 rounded"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Desktop Top Bar (>= md) */}
      <div className="hidden md:flex items-center justify-between gap-4">
        {/* Brand and Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-sm shadow-emerald-950">
            ক
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base tracking-tight text-white">
                Kaj
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-[#1C2224] text-emerald-400 font-medium border border-[#2A3235]">
                কাজ
              </span>
            </div>
            {memoryMb !== undefined && (
              <span className="text-[11px] text-gray-400">
                Daemon: ~{memoryMb} MB RSS
              </span>
            )}
          </div>
        </div>

        {/* View Switcher: Board vs Calendar */}
        <nav
          aria-label="Main Navigation"
          className="flex items-center bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]"
        >
          <button
            type="button"
            data-testid="nav-board-btn"
            onClick={() => onViewChange("board")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === "board"
                ? "bg-[#1C2224] text-emerald-400 shadow-sm border border-[#2A3235]"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
            Kanban Board
          </button>
          <button
            type="button"
            data-testid="nav-calendar-btn"
            onClick={() => onViewChange("calendar")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === "calendar"
                ? "bg-[#1C2224] text-emerald-400 shadow-sm border border-[#2A3235]"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Calendar
          </button>
        </nav>

        {/* Omnipresent Top Search Bar (UI-007) */}
        <div className="relative flex-1 max-w-xs flex items-center">
          <input
            type="text"
            data-testid="desktop-task-search-input"
            value={searchQuery}
            onInput={(e) =>
              onSearchChange((e.target as HTMLInputElement).value)
            }
            placeholder="Search tasks..."
            className="w-full bg-[#0E1111] text-xs text-gray-200 placeholder-gray-500 rounded-xl px-3 py-1.5 pl-8 pr-7 border border-[#2A3235] focus:outline-none focus:border-emerald-500/80 transition-colors"
          />
          <svg
            className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              type="button"
              data-testid="desktop-search-clear-btn"
              onClick={() => onSearchChange("")}
              className="absolute right-2 text-xs text-gray-400 hover:text-white p-0.5 rounded"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Card Density Selector (UI-005) */}
        {currentView === "board" && (
          <div
            data-testid="density-selector"
            className="flex items-center gap-1 bg-[#0E1111] p-1 rounded-xl border border-[#2A3235]"
            title="Card Density Display Option"
          >
            <span className="text-[10px] uppercase font-bold text-gray-400 px-2 tracking-wider">
              Density:
            </span>
            <button
              type="button"
              data-testid="density-compact-btn"
              data-active={density === "compact" ? "true" : "false"}
              onClick={() => onDensityChange("compact")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                density === "compact"
                  ? "bg-[#1C2224] text-emerald-400 border border-[#2A3235] shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              title="Compact (Streamlined height, inline dates)"
            >
              Compact
            </button>
            <button
              type="button"
              data-testid="density-minimal-btn"
              data-active={density === "minimal" ? "true" : "false"}
              onClick={() => onDensityChange("minimal")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                density === "minimal"
                  ? "bg-[#1C2224] text-emerald-400 border border-[#2A3235] shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              title="Minimum (Ultra-dense single-line strips)"
            >
              Minimum
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-testid="reorder-projects-btn"
            onClick={onOpenReorder}
            title="Manage Projects & Swimlanes"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235] hover:border-gray-600 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
            Projects
          </button>

          <button
            type="button"
            data-testid="open-archive-btn"
            onClick={onOpenArchive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1C2224] text-gray-300 hover:text-white border border-[#2A3235] hover:border-gray-600 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            Archive
            {completedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0E1111] text-emerald-400 border border-[#2A3235] font-semibold">
                {completedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="add-task-btn"
            onClick={onAddTask}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#10B981] hover:bg-[#34D399] text-[#0E1111] shadow-md shadow-emerald-950 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Task
          </button>
        </div>
      </div>
    </header>
  );
}
