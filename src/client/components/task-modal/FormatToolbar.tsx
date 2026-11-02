// [spec: UI-004]
import { h } from "preact";

interface FormatToolbarProps {
  textareaRef: { current: HTMLTextAreaElement | null };
  details: string;
  onDetailsChange: (details: string) => void;
}

export function FormatToolbar({
  textareaRef,
  details,
  onDetailsChange,
}: FormatToolbarProps) {
  const applyWrapFormatting = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const currentVal = textarea.value || details || "";
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectedText = currentVal.substring(start, end);

    const replacement = `${prefix}${selectedText || "text"}${suffix}`;
    const nextVal =
      currentVal.substring(0, start) + replacement + currentVal.substring(end);

    onDetailsChange(nextVal);

    const newCursorStart = start + prefix.length;
    const newCursorEnd =
      newCursorStart + (selectedText ? selectedText.length : 4);
    textarea.value = nextVal;
    textarea.focus();
    textarea.setSelectionRange(newCursorStart, newCursorEnd);
  };

  const applyListFormatting = (type: "bullet" | "number") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const currentVal = textarea.value || details || "";
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    // Find the line boundaries of current selection
    const beforeSelection = currentVal.substring(0, start);
    const lineStart = beforeSelection.lastIndexOf("\n") + 1;
    let lineEnd = currentVal.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = currentVal.length;

    const linesBlock = currentVal.substring(lineStart, lineEnd);
    const lines = linesBlock.split("\n");

    const formattedLines = lines.map((line, idx) => {
      // Strip any existing list markers
      const cleanLine = line.replace(/^(\s*(?:[-*+]|\d+\.)\s*)/, "");
      if (type === "bullet") {
        return `- ${cleanLine || "item"}`;
      } else {
        return `${idx + 1}. ${cleanLine || "item"}`;
      }
    });

    const replacedBlock = formattedLines.join("\n");
    const nextVal =
      currentVal.substring(0, lineStart) +
      replacedBlock +
      currentVal.substring(lineEnd);

    onDetailsChange(nextVal);

    textarea.value = nextVal;
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + replacedBlock.length);
  };

  return (
    <div
      data-testid="details-format-toolbar"
      className="flex items-center gap-1 p-1 mb-2 rounded-lg bg-[#161B1C] border border-[#2A3235] shadow-sm select-none"
    >
      {/* Bold */}
      <button
        type="button"
        data-testid="format-bold-btn"
        title="Bold (Ctrl/Cmd+B)"
        onClick={() => applyWrapFormatting("**", "**")}
        className="w-7 h-7 flex items-center justify-center rounded text-gray-200 hover:bg-[#252D30] hover:text-white transition-colors"
      >
        <span className="font-bold font-serif text-sm">B</span>
      </button>

      {/* Italic */}
      <button
        type="button"
        data-testid="format-italic-btn"
        title="Italic (Ctrl/Cmd+I)"
        onClick={() => applyWrapFormatting("*", "*")}
        className="w-7 h-7 flex items-center justify-center rounded text-gray-200 hover:bg-[#252D30] hover:text-white transition-colors"
      >
        <span className="italic font-serif text-sm">I</span>
      </button>

      {/* Underline */}
      <button
        type="button"
        data-testid="format-underline-btn"
        title="Underline (Ctrl/Cmd+U)"
        onClick={() => applyWrapFormatting("<u>", "</u>")}
        className="w-7 h-7 flex items-center justify-center rounded text-gray-200 hover:bg-[#252D30] hover:text-white transition-colors"
      >
        <span className="underline font-serif text-sm">U</span>
      </button>

      <div className="w-[1px] h-4 bg-[#2A3235] mx-1" />

      {/* Bullet list */}
      <button
        type="button"
        data-testid="format-bullet-list-btn"
        title="Bulleted List"
        onClick={() => applyListFormatting("bullet")}
        className="w-7 h-7 flex items-center justify-center rounded text-gray-200 hover:bg-[#252D30] hover:text-white transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3.5" cy="6" r="1.5" fill="currentColor" />
          <circle cx="3.5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="3.5" cy="18" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {/* Numbered list */}
      <button
        type="button"
        data-testid="format-number-list-btn"
        title="Numbered List"
        onClick={() => applyListFormatting("number")}
        className="w-7 h-7 flex items-center justify-center rounded text-gray-200 hover:bg-[#252D30] hover:text-white transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <path d="M4 6h1v4M3 10h3" strokeWidth="2" />
          <path d="M3.5 14a1.5 1.5 0 0 1 2.5 1c0 1-1.5 2-2.5 3h3" strokeWidth="2" />
        </svg>
      </button>
    </div>
  );
}
