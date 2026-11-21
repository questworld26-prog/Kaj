// [verifies: UI-016]
import { describe, expect, it } from "vitest";
import {
  getTaskCardSurfaceClasses,
  shouldHighlightTaskCardRed,
} from "../../src/shared/types.js";

describe("UI-016: Tracking Task Red Highlight Evaluation", () => {
  // [verifies: UI-016/AC-UI-016.3]
  it("preserves today-action highlighting on non-tracking tasks and limits tracking red highlight strictly to past due_date", () => {
    const today = "2026-11-21";
    const yesterday = "2026-11-20";
    const tomorrow = "2026-11-22";

    expect(
      shouldHighlightTaskCardRed(
        { status: "in_progress_today", action_date: today, due_date: null },
        today,
      ),
    ).toBe(true);
    expect(
      shouldHighlightTaskCardRed(
        { status: "todo", action_date: tomorrow, due_date: yesterday },
        today,
      ),
    ).toBe(false);

    expect(
      shouldHighlightTaskCardRed(
        { status: "tracking", action_date: today, due_date: null },
        today,
      ),
    ).toBe(false);
    expect(
      shouldHighlightTaskCardRed(
        { status: "tracking", action_date: today, due_date: today },
        today,
      ),
    ).toBe(false);
    expect(
      shouldHighlightTaskCardRed(
        { status: "tracking", action_date: today, due_date: tomorrow },
        today,
      ),
    ).toBe(false);
    expect(
      shouldHighlightTaskCardRed(
        { status: "tracking", action_date: today, due_date: yesterday },
        today,
      ),
    ).toBe(true);
    expect(
      shouldHighlightTaskCardRed(
        { status: "tracking", action_date: null, due_date: yesterday },
        today,
      ),
    ).toBe(true);

    expect(
      getTaskCardSurfaceClasses(
        { status: "tracking", action_date: today, due_date: yesterday },
        "border-[#2A3235]",
        today,
      ),
    ).toContain("bg-[#4A1215]");

    expect(
      getTaskCardSurfaceClasses(
        { status: "tracking", action_date: today, due_date: today },
        "border-[#2A3235]",
        today,
      ),
    ).toContain("bg-[#1C2224]");
  });
});
