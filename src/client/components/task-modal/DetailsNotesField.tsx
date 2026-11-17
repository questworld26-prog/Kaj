// [spec: UI-004]
// [spec: UI-015]
import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { FormatToolbar } from "./FormatToolbar.js";
import { renderFormattedNotes } from "./format-renderer.js";

interface DetailsNotesFieldProps {
  details: string;
  isOpen: boolean;
  taskKey: string;
  onDetailsChange: (nextDetails: string) => void;
}

export function DetailsNotesField({
  details,
  isOpen,
  taskKey,
  onDetailsChange,
}: DetailsNotesFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  useEffect(() => {
    setShowFormatToolbar(false);
    setIsEditingDetails(false);
  }, [isOpen, taskKey]);

  const hasDetailsText = details.trim().length > 0;
  const showRenderedPreview =
    !showFormatToolbar && !isEditingDetails && hasDetailsText;

  const focusTextareaSoon = () => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
      }
    });
  };

  const handleToggleFormat = () => {
    if (showFormatToolbar) {
      setShowFormatToolbar(false);
      setIsEditingDetails(false);
    } else {
      setShowFormatToolbar(true);
      setIsEditingDetails(true);
      focusTextareaSoon();
    }
  };

  const handleActivatePreview = () => {
    setIsEditingDetails(true);
    focusTextareaSoon();
  };

  const handleTextareaBlur = (
    e: h.JSX.TargetedFocusEvent<HTMLTextAreaElement>,
  ) => {
    const nextFocusTarget = e.relatedTarget as Node | null;
    if (
      !showFormatToolbar &&
      (!nextFocusTarget || !containerRef.current?.contains(nextFocusTarget))
    ) {
      setIsEditingDetails(false);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-gray-300">
          Task Details & Notes
        </label>
        <button
          type="button"
          data-testid="details-format-toggle-btn"
          onClick={handleToggleFormat}
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
          textareaRef={textareaRef}
          details={details}
          onDetailsChange={onDetailsChange}
        />
      )}

      {showRenderedPreview ? (
        <div
          role="button"
          tabIndex={0}
          data-testid="details-rendered-preview"
          title="Click to edit notes"
          aria-label="Edit task details and notes"
          onClick={handleActivatePreview}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleActivatePreview();
            }
          }}
          className="w-full min-h-[4.75rem] px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] hover:border-emerald-500/50 focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-1 text-xs text-gray-100 cursor-text transition-colors space-y-1"
        >
          {renderFormattedNotes(details)}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          name="details"
          rows={3}
          placeholder="Full markdown notes, links, acceptance criteria..."
          value={details}
          onFocus={() => setIsEditingDetails(true)}
          onBlur={handleTextareaBlur}
          onInput={(e) =>
            onDetailsChange((e.target as HTMLTextAreaElement).value)
          }
          className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
        />
      )}
    </div>
  );
}
