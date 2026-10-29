// [spec: UI-006]
import { test, expect } from "@playwright/test";

test.describe("Kaj (কাজ) Mobile Responsive & Execution Cockpit (UI-006)", () => {
  const pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors.length = 0;
    page.on("pageerror", (err) => {
      pageErrors.push(`Page error: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        pageErrors.push(`Browser console error: ${msg.text()}`);
      }
    });
  });

  test.afterEach(async ({ page }) => {
    expect(pageErrors).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // [verifies: UI-006/AC-UI-006.1]
  test("preserves desktop layout on >= 768px and displays 4-tab mobile dock on < 768px", async ({
    page,
  }) => {
    // 1. Desktop viewport: 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#app-root")).toBeVisible();

    // Verify desktop headers exist and mobile dock is hidden
    await expect(page.locator('[data-testid="column-header"]')).toHaveCount(6);
    await expect(
      page.locator('[data-testid="mobile-bottom-dock"]'),
    ).toBeHidden();

    // 2. Mobile viewport: 390x844 (iPhone 12/13/14 size)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    // Verify mobile dock is visible with 4 tabs
    const mobileDock = page.locator('[data-testid="mobile-bottom-dock"]');
    await expect(mobileDock).toBeVisible();
    await expect(
      mobileDock.locator('[data-testid="mobile-tab-cockpit"]'),
    ).toBeVisible();
    await expect(
      mobileDock.locator('[data-testid="mobile-tab-pods"]'),
    ).toBeVisible();
    await expect(
      mobileDock.locator('[data-testid="mobile-tab-calendar"]'),
    ).toBeVisible();
    await expect(
      mobileDock.locator('[data-testid="mobile-tab-triage"]'),
    ).toBeVisible();
  });

  // [verifies: UI-006/AC-UI-006.2]
  test("renders pinned Today focus plate, Tracking container, and Week/Month accordions on Cockpit tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Seed tasks across horizons
    await page.request.post("/api/tasks", {
      data: {
        title: "Mobile Cockpit Today Task",
        status: "in_progress_today",
        priority: "today",
      },
    });
    await page.request.post("/api/tasks", {
      data: {
        title: "Mobile Cockpit Waiting Task",
        status: "tracking",
        waiting_on: "API Review",
      },
    });
    await page.request.post("/api/tasks", {
      data: {
        title: "Mobile Cockpit Week Task",
        status: "in_progress_week",
      },
    });

    await page.goto("/");
    await expect(
      page.locator('[data-testid="mobile-cockpit-view"]'),
    ).toBeVisible();

    // Check Today focus plate contains the today task
    const todayPlate = page.locator('[data-testid="mobile-today-focus-plate"]');
    await expect(todayPlate).toBeVisible();
    await expect(todayPlate).toContainText("Mobile Cockpit Today Task");

    // Check Tracking container contains the waiting task
    const trackingBox = page.locator(
      '[data-testid="mobile-tracking-container"]',
    );
    await expect(trackingBox).toBeVisible();
    await expect(trackingBox).toContainText("Mobile Cockpit Waiting Task");
    await expect(trackingBox).toContainText("API Review");

    // Check Week and Month horizon accordions exist
    await expect(
      page.locator('[data-testid="mobile-horizon-week"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="mobile-horizon-month"]'),
    ).toBeVisible();
  });

  // [verifies: UI-006/AC-UI-006.3]
  test("renders collapsible project swimlane pods with filter chips and reorder controls on Pods tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Create a project
    const projRes = await page.request.post("/api/projects", {
      data: { name: "Mobile Project Beta", color: "#38BDF8" },
    });
    const proj = (await projRes.json()) as { id: string };

    await page.request.post("/api/tasks", {
      data: {
        title: "Pod Specific Task",
        project_id: proj.id,
        status: "todo",
      },
    });

    await page.goto("/");
    // Switch to Pods tab
    await page.click('[data-testid="mobile-tab-pods"]');
    await expect(
      page.locator('[data-testid="mobile-pods-view"]'),
    ).toBeVisible();

    // Verify project filter chip is present
    await expect(
      page.locator('[data-testid="mobile-project-filters"]'),
    ).toBeVisible();

    // Verify project pod renders with title and task
    const pod = page.locator(`[data-testid="mobile-swimlane-pod-${proj.id}"]`);
    await expect(pod).toBeVisible();
    await expect(pod).toContainText("Mobile Project Beta");
    await expect(pod).toContainText("Pod Specific Task");

    // Check reorder buttons exist on the pod
    await expect(
      pod.locator('[data-testid="mobile-pod-move-up"]'),
    ).toBeVisible();
    await expect(
      pod.locator('[data-testid="mobile-pod-move-down"]'),
    ).toBeVisible();
  });

  // [verifies: UI-006/AC-UI-006.4]
  test("renders 7-day date strip, daily agenda list, and unscheduled drawer with 1-tap scheduling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Create a scheduled task and an unscheduled task
    await page.request.post("/api/tasks", {
      data: {
        title: "Scheduled For Today Mobile",
        status: "todo",
        action_date: todayStr,
      },
    });
    const unRes = await page.request.post("/api/tasks", {
      data: {
        title: "Unscheduled Mobile Need Action",
        status: "todo",
      },
    });
    const unTask = (await unRes.json()) as { id: string };

    await page.goto("/");
    // Switch to Calendar tab
    await page.click('[data-testid="mobile-tab-calendar"]');
    await expect(
      page.locator('[data-testid="mobile-calendar-view"]'),
    ).toBeVisible();

    // 7-day date strip is visible
    await expect(
      page.locator('[data-testid="mobile-calendar-strip"]'),
    ).toBeVisible();

    // Scheduled task shows in today's agenda
    await expect(
      page.locator('[data-testid="mobile-calendar-agenda"]'),
    ).toContainText("Scheduled For Today Mobile");

    // Unscheduled drawer lists the task
    const unCard = page.locator(
      `[data-testid="mobile-unscheduled-task-${unTask.id}"]`,
    );
    await expect(unCard).toBeVisible();

    // Tap + ▶ Action to schedule onto today
    await unCard.locator('[data-testid="mobile-schedule-action-btn"]').click();

    // Verify task now appears in the agenda
    await expect(
      page.locator('[data-testid="mobile-calendar-agenda"]'),
    ).toContainText("Unscheduled Mobile Need Action");
  });

  // [verifies: UI-006/AC-UI-006.5]
  test("opens touch bottom action sheet to move task between columns or complete without drag-and-drop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const res = await page.request.post("/api/tasks", {
      data: {
        title: "Action Sheet Target Task",
        status: "todo",
      },
    });
    const task = (await res.json()) as { id: string };

    await page.goto("/");
    await page.click('[data-testid="mobile-tab-triage"]');

    // Find the task card and click its status move button
    const card = page.locator(`[data-testid="mobile-task-card-${task.id}"]`);
    await expect(card).toBeVisible();

    await card.locator('[data-testid="mobile-task-status-trigger"]').click();

    // Bottom action sheet should open
    const sheet = page.locator('[data-testid="mobile-action-sheet"]');
    await expect(sheet).toBeVisible();

    // Select "⚡ Today"
    await sheet
      .locator('[data-testid="action-sheet-status-in_progress_today"]')
      .click();
    await expect(sheet).toBeHidden();

    // Navigate to Cockpit tab and verify task is now in Today focus plate
    await page.click('[data-testid="mobile-tab-cockpit"]');
    const todayPlate = page.locator('[data-testid="mobile-today-focus-plate"]');
    await expect(todayPlate).toContainText("Action Sheet Target Task");
  });
});
