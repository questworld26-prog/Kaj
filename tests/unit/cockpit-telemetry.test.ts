// [spec: UI-009]
// [spec: UI-012]
import { describe, it, expect } from "vitest";
import {
  buildCreatorStackData,
  buildCreatorStackDataFromSummary,
  buildTelemetrySummaryFromTasks,
  buildWeeklyVelocityStackFromSummary,
} from "../../src/client/components/cockpit/types.js";

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

  // [verifies: UI-012/AC-UI-012.4]
  it("attributes unspecified creator tasks and snapshots to the configured non-VIP user", () => {
    const now = new Date("2026-11-17T03:00:00.000Z"); // 2026-W47
    const completed = [
      { completed_at: now.toISOString(), created_by: null, project_id: null },
      { completed_at: now.toISOString(), created_by: "  ", project_id: null },
      { completed_at: now.toISOString(), created_by: "Oblix", project_id: null },
      { completed_at: now.toISOString(), created_by: "Asterix", project_id: null },
    ];

    const stackData = buildCreatorStackData(completed, now, "Oblix");
    expect(stackData.weeks[0].creators).toEqual({
      Oblix: 3,
      Asterix: 1,
    });
    expect(stackData.creatorList).not.toContain("Unspecified");

    const clientSummary = buildTelemetrySummaryFromTasks(completed, 90, "Oblix");
    const stackFromClientSummary = buildCreatorStackDataFromSummary(
      clientSummary,
      now,
      "Oblix",
    );
    expect(stackFromClientSummary.weeks[0].creators).toEqual({
      Oblix: 3,
      Asterix: 1,
    });

    const serverSnapshotSummary = {
      retention_days: 90,
      total_completed: 3,
      live_completed: 1,
      snapshotted_completed: 2,
      by_week: [{ iso_week: "2026-W47", count: 3 }],
      by_project: [{ project_key: "unassigned", count: 3 }],
      by_week_creator: [
        { iso_week: "2026-W47", creator: "Unspecified", count: 2 },
        { iso_week: "2026-W47", creator: "Oblix", count: 1 },
      ],
    };
    const merged = buildCreatorStackDataFromSummary(
      serverSnapshotSummary,
      now,
      "Oblix",
    );
    expect(merged.weeks[0].creators).toEqual({ Oblix: 3 });
  });

  // [verifies: UI-009/AC-UI-009.3]
  it("builds 6-week chronological stacked weekly velocity data attributing unspecified creators to non-VIP default", () => {
    const now = new Date("2026-11-17T03:00:00.000Z"); // 2026-W47
    const summary = buildTelemetrySummaryFromTasks(
      [
        {
          completed_at: "2026-10-21T10:00:00.000Z", // W43
          created_by: null,
          project_id: null,
        },
        {
          completed_at: "2026-11-17T02:00:00.000Z", // W47
          created_by: null,
          project_id: null,
        },
        {
          completed_at: "2026-11-17T02:30:00.000Z", // W47
          created_by: "Asterix",
          project_id: null,
        },
      ],
      90,
      "Oblix",
    );

    const velocity = buildWeeklyVelocityStackFromSummary(summary, now, "Oblix");
    expect(velocity.weeks).toHaveLength(6);
    expect(velocity.weeks[0].label).toBe("W42");
    expect(velocity.weeks[1].label).toBe("W43");
    expect(velocity.weeks[1].total).toBe(1);
    expect(velocity.weeks[1].creators).toEqual({ Oblix: 1 });

    const current = velocity.weeks[5];
    expect(current.label).toBe("W47");
    expect(current.isCurrent).toBe(true);
    expect(current.total).toBe(2);
    expect(current.creators).toEqual({ Oblix: 1, Asterix: 1 });
    expect(velocity.creatorList).toEqual(["Oblix", "Asterix"]);
  });
});
