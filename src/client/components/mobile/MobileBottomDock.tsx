// [spec: UI-006]
import { h } from "preact";
import type { MobileTab } from "./types.js";

interface MobileBottomDockProps {
  currentTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

export function MobileBottomDock({
  currentTab,
  onTabChange,
}: MobileBottomDockProps) {
  return (
    <nav
      data-testid="mobile-bottom-dock"
      aria-label="Mobile Navigation Dock"
      className="fixed bottom-0 inset-x-0 z-40 bg-[#121718]/95 backdrop-blur-md border-t border-[#2A3235] px-2 py-2 grid grid-cols-4 text-center text-xs"
    >
      <button
        type="button"
        data-testid="mobile-tab-cockpit"
        onClick={() => onTabChange("cockpit")}
        className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
          currentTab === "cockpit"
            ? "text-emerald-400 font-bold"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        <span className="text-base leading-none">⚡</span>
        <span className="text-xs mt-0.5">Cockpit</span>
      </button>

      <button
        type="button"
        data-testid="mobile-tab-pods"
        onClick={() => onTabChange("pods")}
        className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
          currentTab === "pods"
            ? "text-emerald-400 font-bold"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        <span className="text-base leading-none">📋</span>
        <span className="text-xs mt-0.5">Pods</span>
      </button>

      <button
        type="button"
        data-testid="mobile-tab-calendar"
        onClick={() => onTabChange("calendar")}
        className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
          currentTab === "calendar"
            ? "text-emerald-400 font-bold"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        <span className="text-base leading-none">📅</span>
        <span className="text-xs mt-0.5">7-Day</span>
      </button>

      <button
        type="button"
        data-testid="mobile-tab-triage"
        onClick={() => onTabChange("triage")}
        className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
          currentTab === "triage"
            ? "text-emerald-400 font-bold"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        <span className="text-base leading-none">📥</span>
        <span className="text-xs mt-0.5">Triage</span>
      </button>
    </nav>
  );
}
