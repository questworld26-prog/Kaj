import { describe, it, expect } from "vitest";
import {
  shouldShowTaskInBoardOrTriage,
  type RepeatRule,
  type TaskStatus,
} from "../../src/shared/types.js";

describe("UI-011: Repeating triage visibility helper", () => {
  // [verifies: UI-011/AC-UI-011.2]
  it("hides recurring triage tasks across all projects and unassigned inbox while keeping non-repeating triage tasks", () => {
    const projectIds: Array<string | null> = [null, "proj-alpha", "proj-beta"];
    const repeatRules: RepeatRule[] = ["weekly", "monthly", "yearly"];

    for (const project_id of projectIds) {
      for (const repeat_rule of repeatRules) {
        expect(
          shouldShowTaskInBoardOrTriage(
            { status: "triage", repeat_rule, project_id },
            true,
          ),
        ).toBe(false);
      }

      expect(
        shouldShowTaskInBoardOrTriage(
          { status: "triage", repeat_rule: "none", project_id },
          true,
        ),
      ).toBe(true);
    }
  });

  // [verifies: UI-011/AC-UI-011.3]
  it("keeps recurring tasks in non-triage active columns visible when enabled and leaves all triage tasks visible when disabled", () => {
    const visibleStatuses: TaskStatus[] = [
      "todo",
      "in_progress_today",
      "in_progress_week",
      "in_progress_month",
      "tracking",
    ];
    const repeatRules: RepeatRule[] = ["weekly", "monthly", "yearly"];

    for (const status of visibleStatuses) {
      for (const repeat_rule of repeatRules) {
        expect(
          shouldShowTaskInBoardOrTriage({ status, repeat_rule }, true),
        ).toBe(true);
      }
    }

    for (const repeat_rule of repeatRules) {
      expect(
        shouldShowTaskInBoardOrTriage({ status: "triage", repeat_rule }, false),
      ).toBe(true);
    }
  });
});
