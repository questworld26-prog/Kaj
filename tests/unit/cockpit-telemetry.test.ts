// [spec: UI-012]
import { describe, it, expect } from "vitest";
import { buildCreatorStackData } from "../../src/client/components/cockpit/types.js";

describe("UI-012: Cockpit creator stacked telemetry aggregation", () => {
  // [verifies: UI-012/AC-UI-012.2]
  it("orders weekly rows from the latest current week on top down to older weeks with accurate creator counts", () => {
    const now = new Date("2026-11-14T12:00:00.000Z"); // 2026-W46
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // W45
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // W44

    const result = buildCreatorStackData(
      [
        { completed_at: twoWeeksAgo.toISOString(), created_by: "Alice" },
        { completed_at: oneWeekAgo.toISOString(), created_by: "Bob" },
        { completed_at: oneWeekAgo.toISOString(), created_by: "Bob" },
        { completed_at: now.toISOString(), created_by: "Alice" },
        { completed_at: now.toISOString(), created_by: "Alice" },
        { completed_at: now.toISOString(), created_by: "Alice" },
        { completed_at: now.toISOString(), created_by: null },
      ],
      now,
    );

    expect(result.weeks).toHaveLength(3);
    expect(result.weeks[0].isCurrent).toBe(true);
    expect(result.weeks[0].label).toBe("W46 (Current)");
    expect(result.weeks[0].total).toBe(4);
    expect(result.weeks[0].creators).toEqual({ Alice: 3, Unspecified: 1 });

    expect(result.weeks[1].isCurrent).toBe(false);
    expect(result.weeks[1].label).toBe("W45");
    expect(result.weeks[1].total).toBe(2);
    expect(result.weeks[1].creators).toEqual({ Bob: 2 });

    expect(result.weeks[2].isCurrent).toBe(false);
    expect(result.weeks[2].label).toBe("W44");
    expect(result.weeks[2].total).toBe(1);
    expect(result.weeks[2].creators).toEqual({ Alice: 1 });
  });
});
