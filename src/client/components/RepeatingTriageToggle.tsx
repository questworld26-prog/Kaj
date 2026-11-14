// [spec: UI-011]
import { h } from "preact";

interface RepeatingTriageToggleProps {
  hideRepeatingTriage: boolean;
  hiddenCount?: number;
  onToggle: () => void;
  testId: string;
  countTestId?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Accessible toggle button controlling global hiding of recurring tasks in `triage`
 * across every project swimlane and the unassigned inbox.
 */
// [spec: UI-011]
export function RepeatingTriageToggle({
  hideRepeatingTriage,
  hiddenCount = 0,
  onToggle,
  testId,
  countTestId,
  compact = false,
  className = "",
}: RepeatingTriageToggleProps) {
  const titleText = hideRepeatingTriage
    ? "Show repeating items in triage for all projects"
    : "Hide repeating items in triage for all projects";

  const sizeClasses = compact
    ? "min-h-[24px] px-2 py-0.5 rounded-md text-[11px]"
    : "min-h-[28px] px-2.5 py-1 rounded-lg text-xs";

  const stateClasses = hideRepeatingTriage
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25"
    : "bg-[#1C2224] text-gray-400 border-[#2A3235] hover:text-gray-200 hover:border-gray-500/50";

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={hideRepeatingTriage}
      onClick={onToggle}
      title={titleText}
      className={`inline-flex items-center justify-center gap-1.5 border font-medium transition-colors shrink-0 ${sizeClasses} ${stateClasses} ${className}`}
    >
      <span aria-hidden="true" className="text-[11px] leading-none">
        ↻
      </span>
      {compact ? (
        <span>
          Hide<span className="hidden xl:inline"> Repeat</span>
          <span className="sr-only">
            <span className="xl:hidden"> repeating</span> items in triage for
            all projects
          </span>
        </span>
      ) : (
        <span>
          Hide Repeating Triage
          <span className="sr-only"> across all projects</span>
        </span>
      )}
      {hideRepeatingTriage && hiddenCount > 0 && (
        <span
          {...(countTestId ? { "data-testid": countTestId } : {})}
          className="px-1.5 py-0 rounded bg-emerald-500/25 text-emerald-200 text-[10px] font-semibold leading-tight"
        >
          {hiddenCount}
        </span>
      )}
    </button>
  );
}
