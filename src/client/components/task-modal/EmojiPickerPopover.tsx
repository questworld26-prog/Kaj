// [spec: UI-004]
import { h } from "preact";
import { useState } from "preact/hooks";

export const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Work & Tech": [
    "🚀",
    "🐛",
    "📝",
    "⚡",
    "🎯",
    "📦",
    "🔍",
    "💡",
    "📅",
    "🔔",
    "🎨",
    "🧪",
    "🔐",
    "⚙️",
    "🔥",
    "✅",
    "🛠️",
    "💬",
    "✨",
    "📊",
    "🌐",
    "💻",
    "🧹",
    "📌",
    "📁",
    "📂",
    "📈",
    "📉",
    "📱",
    "🖥️",
    "⌨️",
    "📧",
    "📫",
    "🏷️",
    "💳",
    "💰",
  ],
  "Status & Focus": [
    "🔴",
    "🟡",
    "🟢",
    "⭐",
    "🏆",
    "⏳",
    "🛑",
    "⚠️",
    "🚨",
    "🚩",
    "❓",
    "❗",
    "💤",
    "💎",
    "💥",
    "🚧",
    "💯",
    "🔝",
    "🆗",
    "🆕",
    "🔒",
    "🔑",
    "📎",
    "📖",
  ],
  "Team & Life": [
    "😀",
    "😎",
    "🤔",
    "🙌",
    "👍",
    "👎",
    "🤝",
    "💪",
    "👀",
    "🧠",
    "🧑‍💻",
    "🕵️",
    "🎉",
    "☕",
    "🍕",
    "🌱",
    "🧘",
    "🚲",
    "✈️",
    "🏠",
    "☀️",
    "🌙",
    "🎵",
    "❤️",
  ],
};

// Regex matching common unicode emojis at start of string
export const EMOJI_PREFIX_REGEX =
  /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;

interface EmojiPickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

export function EmojiPickerPopover({
  isOpen,
  onClose,
  onSelectEmoji,
}: EmojiPickerPopoverProps) {
  const [activeCategory, setActiveCategory] = useState<string>("Work & Tech");
  const [customEmojiInput, setCustomEmojiInput] = useState<string>("");

  if (!isOpen) return null;

  const handleApplyCustom = () => {
    const trimmed = customEmojiInput.trim();
    if (!trimmed) return;
    onSelectEmoji(trimmed);
    setCustomEmojiInput("");
    onClose();
  };

  return (
    <div
      data-testid="task-emoji-palette"
      className="absolute left-0 top-12 z-30 p-3.5 rounded-2xl bg-[#121718] border border-[#2A3235] shadow-2xl shadow-black/90 w-80 backdrop-blur-md space-y-2.5"
    >
      <div className="flex items-center justify-between text-xs text-gray-400 pb-1.5 border-b border-[#2A3235]">
        <span className="font-semibold text-emerald-400">Choose Icon</span>
        <button
          type="button"
          onClick={onClose}
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
              onSelectEmoji(emoji);
              onClose();
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
          onInput={(e) =>
            setCustomEmojiInput((e.target as HTMLInputElement).value)
          }
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0E1111] border border-[#2A3235] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          disabled={!customEmojiInput.trim()}
          onClick={handleApplyCustom}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
