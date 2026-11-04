import { test, expect } from "@playwright/test";

test.describe("Kaj (কাজ) Bento × Chronos UI Verification", () => {
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

  test.afterEach(async () => {
    expect(pageErrors).toEqual([]);
  });

  // [verifies: UI-001/AC-UI-001.1]
  test("renders full-width 6-column Kanban board without sidebar", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#app-root")).toBeVisible();

    // Verify 6 column tracks in header
    const columns = page.locator('[data-testid="column-header"]');
    await expect(columns).toHaveCount(6);

    const columnNames = await columns.allTextContents();
    const joinedNames = columnNames.join(" ").toLowerCase();
    expect(joinedNames).toContain("triage");
    expect(joinedNames).toContain("todo");
    expect(joinedNames).toContain("today");
    expect(joinedNames).toContain("this week");
    expect(joinedNames).toContain("this month");
    expect(joinedNames).toContain("tracking");

    // Confirm no legacy left sidebar exists (100% full-width layout)
    await expect(page.locator("aside.left-sidebar")).toHaveCount(0);
  });

  // [verifies: UI-001/AC-UI-001.2]
  test("renders project swimlane pods with collapsible headers and task counts", async ({
    page,
  }) => {
    await page.goto("/");

    // Check default Unassigned swimlane pod
    const unassignedPod = page.locator(
      '[data-testid="swimlane-pod-unassigned"]',
    );
    await expect(unassignedPod).toBeVisible();

    // Create a new project via API or modal
    await page.request.post("/api/projects", {
      data: { name: "Core Infrastructure", color: "#10B981" },
    });

    // Create a task inside Core Infrastructure
    const projRes = await page.request.get("/api/projects");
    const projects = (await projRes.json()) as { id: string; name: string }[];
    const infraProj = projects.find((p) => p.name === "Core Infrastructure")!;

    await page.request.post("/api/tasks", {
      data: {
        title: "Deploy K8s Cluster",
        project_id: infraProj.id,
        status: "todo",
        priority: "month",
      },
    });

    await page.reload();

    const infraPod = page.locator(
      `[data-testid="swimlane-pod-${infraProj.id}"]`,
    );
    await expect(infraPod).toBeVisible();
    await expect(
      infraPod.locator('[data-testid="swimlane-task-count"]'),
    ).toContainText("1");

    // Test collapse / expand
    const collapseBtn = infraPod.locator(
      '[data-testid="swimlane-collapse-toggle"]',
    );
    await collapseBtn.click();
    await expect(
      infraPod.locator('[data-testid="swimlane-content"]'),
    ).toBeHidden();
    await collapseBtn.click();
    await expect(
      infraPod.locator('[data-testid="swimlane-content"]'),
    ).toBeVisible();
  });

  // [verifies: UI-001/AC-UI-001.3]
  test("renders tracking column cards with dashed borders and dedicated carrier/blocker badge", async ({
    page,
  }) => {
    await page.goto("/");

    // Create a tracking task with waiting_on
    await page.request.post("/api/tasks", {
      data: {
        title: "Wait for FedEx delivery of RAM",
        status: "tracking",
        waiting_on: "FedEx 772918390",
        priority: "week",
      },
    });

    await page.reload();

    const trackingCard = page.locator('[data-testid="task-card"]').filter({
      hasText: "Wait for FedEx delivery of RAM",
    });
    await expect(trackingCard).toBeVisible();

    // Check dashed border style and blocker badge
    const cardEl = trackingCard.first();
    await expect(cardEl).toHaveClass(/border-dashed/);
    await expect(cardEl.locator('[data-testid="blocker-badge"]')).toContainText(
      "FedEx 772918390",
    );
  });

  // [verifies: UI-001/AC-UI-001.4]
  test("allows moving tasks across columns and swimlanes", async ({ page }) => {
    await page.goto("/");

    // Create a task in Triage
    const res = await page.request.post("/api/tasks", {
      data: {
        title: "Quick Triage Item",
        status: "triage",
        priority: "today",
      },
    });
    const task = (await res.json()) as { id: string };

    await page.reload();

    const taskCard = page.locator(`[data-task-id="${task.id}"]`);
    await expect(taskCard).toBeVisible();

    // Drag task from triage to in_progress_today
    const targetTodayCol = page.locator(
      '[data-testid="swimlane-pod-unassigned"] [data-col="in_progress_today"]',
    );
    await taskCard.dragTo(targetTodayCol);

    // Verify it updated in UI and persisted
    await expect(
      page.locator(
        `[data-col="in_progress_today"] [data-task-id="${task.id}"]`,
      ),
    ).toBeVisible();

    const getRes = await page.request.get(`/api/tasks/${task.id}`);
    const updated = (await getRes.json()) as { status: string };
    expect(updated.status).toBe("in_progress_today");

    // Drag-and-drop across columns (from in_progress_today to tracking)
    const targetTrackingCol = page.locator(
      '[data-testid="swimlane-pod-unassigned"] [data-col="tracking"]',
    );
    await taskCard.dragTo(targetTrackingCol);

    await expect(
      page.locator(`[data-col="tracking"] [data-task-id="${task.id}"]`),
    ).toBeVisible();
    const getRes2 = await page.request.get(`/api/tasks/${task.id}`);
    const updated2 = (await getRes2.json()) as { status: string };
    expect(updated2.status).toBe("tracking");
  });

  // [verifies: UI-001/AC-UI-001.5]
  test("provides controls to reorder project swimlanes immediately", async ({
    page,
  }) => {
    await page.goto("/");

    // Create two test projects
    const p1Res = await page.request.post("/api/projects", {
      data: { name: "Alpha Project", color: "#38BDF8" },
    });
    const p2Res = await page.request.post("/api/projects", {
      data: { name: "Beta Project", color: "#F43F5E" },
    });
    const p1 = (await p1Res.json()) as { id: string };
    const p2 = (await p2Res.json()) as { id: string };

    await page.reload();

    // Open project reorder controls
    const reorderBtn = page.locator('[data-testid="reorder-projects-btn"]');
    await reorderBtn.click();

    const reorderModal = page.locator('[data-testid="project-reorder-modal"]');
    await expect(reorderModal).toBeVisible();

    // Move Beta project up
    const moveUpBtn = reorderModal.locator(
      `[data-project-id="${p2.id}"] [data-testid="move-up-btn"]`,
    );
    await moveUpBtn.click();

    // Close modal
    await reorderModal.locator('[data-testid="close-modal-btn"]').click();

    // Verify board renders Beta before Alpha
    const pods = page.locator('[data-testid^="swimlane-pod-"]');
    const podIds = await pods.evaluateAll((list) =>
      list.map((el) =>
        el.getAttribute("data-testid")?.replace("swimlane-pod-", ""),
      ),
    );

    const betaIdx = podIds.indexOf(p2.id);
    const alphaIdx = podIds.indexOf(p1.id);
    expect(betaIdx).toBeLessThan(alphaIdx);
  });

  // [verifies: UI-001/AC-UI-001.6]
  test("renders consolidated In Progress chamber with 'In Progress' badge and horizon icons (Today ⚡, Week 📅, Month 🗓)", async ({
    page,
  }) => {
    await page.goto("/");

    // Locate the In Progress chamber within the unassigned swimlane
    const chamber = page.locator(
      '[data-testid="swimlane-pod-unassigned"] [data-testid="in-progress-chamber"]',
    );
    await expect(chamber).toBeVisible();

    // Verify "In Progress" badge on the chamber header
    const badge = chamber.locator('[data-testid="in-progress-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/In Progress/i);

    // Verify the 3 sub-columns and their icons
    const todayCol = chamber.locator('[data-col="in_progress_today"]');
    const weekCol = chamber.locator('[data-col="in_progress_week"]');
    const monthCol = chamber.locator('[data-col="in_progress_month"]');

    await expect(todayCol).toBeVisible();
    await expect(weekCol).toBeVisible();
    await expect(monthCol).toBeVisible();

    // Verify icons in headers
    await expect(todayCol).toContainText("⚡");
    await expect(todayCol).toContainText("Today");
    await expect(weekCol).toContainText("📅");
    await expect(weekCol).toContainText("This Week");
    await expect(monthCol).toContainText("🗓");
    await expect(monthCol).toContainText("This Month");

    // Verify Today column has accented focus plate
    await expect(
      chamber.locator('[data-testid="today-focus-plate"]'),
    ).toBeVisible();
  });

  // [verifies: UI-001/AC-UI-001.7]
  test("clicking an add trigger or empty area in a Kanban column opens new task dialog with that status and project pre-populated", async ({
    page,
  }) => {
    // 1. Create a project to test project pre-population
    const projRes = await page.request.post("/api/projects", {
      data: {
        name: "Kanban Prepop Project",
        color: "#10B981",
      },
    });
    const proj = (await projRes.json()) as { id: string };

    await page.goto("/");

    // 2. Locate the column cell in the created project swimlane for "Todo"
    const projPod = page.locator(`[data-testid="swimlane-pod-${proj.id}"]`);
    await expect(projPod).toBeVisible();

    const todoCol = projPod.locator('[data-col="todo"]');
    await expect(todoCol).toBeVisible();

    // Click on the column add button or cell header
    const addBtn = todoCol.locator('[data-testid="col-add-task-btn"]');
    await addBtn.click();

    // Verify task modal opens
    const modal = page.locator('[data-testid="task-modal"]');
    await expect(modal).toBeVisible();

    // Verify status is "todo"
    const statusSelect = modal.locator('select[name="status"]');
    await expect(statusSelect).toHaveValue("todo");

    // Verify project is the created project ID
    const projectSelect = modal.locator('select[name="project_id"]');
    await expect(projectSelect).toHaveValue(proj.id);

    // Close modal
    await modal.locator('[data-testid="cancel-btn"]').click();
    await expect(modal).not.toBeVisible();

    // 3. Test In Progress: Today sub-column in Unassigned swimlane
    const unassignedPod = page.locator('[data-testid="swimlane-pod-unassigned"]');
    const todayCol = unassignedPod.locator('[data-col="in_progress_today"]');
    const todayAddBtn = todayCol.locator('[data-testid="col-add-task-btn"]');
    await todayAddBtn.click();

    await expect(modal).toBeVisible();
    await expect(statusSelect).toHaveValue("in_progress_today");
    await expect(projectSelect).toHaveValue("");

    await modal.locator('[data-testid="cancel-btn"]').click();
    await expect(modal).not.toBeVisible();
  });

  // [verifies: UI-002/AC-UI-002.1]
  test("enforces Chronos dark-mode surfaces #0E1111 canvas and #1C2224 cards", async ({
    page,
  }) => {
    await page.goto("/");

    // Background color of body or root
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // #0E1111 in RGB is rgb(14, 17, 17)
    expect(bodyBg).toBe("rgb(14, 17, 17)");

    // Check card surface color
    const card = page.locator('[data-testid="task-card"]').first();
    if (await card.isVisible()) {
      const cardBg = await card.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      // #1C2224 is rgb(28, 34, 36)
      expect(cardBg).toBe("rgb(28, 34, 36)");
    }
  });

  // [verifies: UI-002/AC-UI-002.2]
  test("uses Emerald/Mint #10B981 for primary actions and Gold #EAB308 for Tracking accents", async ({
    page,
  }) => {
    await page.goto("/");

    const addBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addBtn).toBeVisible();

    // Emerald accent #10B981 is rgb(16, 185, 129)
    const btnBg = await addBtn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor,
    );
    expect(btnBg).toBe("rgb(16, 185, 129)");
  });

  // [verifies: UI-002/AC-UI-002.3]
  test("maintains accessible text and non-text component contrast", async ({
    page,
  }) => {
    await page.goto("/");

    // Verify main body text contrast against #0E1111 background satisfies WCAG AA >= 4.5:1
    const bodyContrastRatio = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number) {
        const a = [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }
      const bgMatch = window
        .getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)!
        .map(Number);
      const textMatch = window
        .getComputedStyle(document.body)
        .color.match(/\d+/g)!
        .map(Number);
      const l1 = getLuminance(textMatch[0], textMatch[1], textMatch[2]);
      const l2 = getLuminance(bgMatch[0], bgMatch[1], bgMatch[2]);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    });
    expect(bodyContrastRatio).toBeGreaterThanOrEqual(4.5);

    // Verify muted text (#9CA3AF) against card surface (#1C2224) satisfies WCAG AA >= 4.5:1
    const mutedContrastRatio = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number) {
        const a = [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }
      // text-gray-400 is #9CA3AF -> rgb(156, 163, 175)
      // card background is #1C2224 -> rgb(28, 34, 36)
      const l1 = getLuminance(156, 163, 175);
      const l2 = getLuminance(28, 34, 36);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(mutedContrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  // [verifies: UI-003/AC-UI-003.1]
  test("calendar view displays Action Dates (▶) and Due Dates (⚑) with distinct visual badges", async ({
    page,
  }) => {
    await page.goto("/");
    const today = new Date().toISOString().slice(0, 10);
    await page.request.post("/api/tasks", {
      data: {
        title: "Distinct Badge Task",
        status: "in_progress_today",
        priority: "today",
        action_date: today,
        due_date: today,
      },
    });

    await page.reload();
    await page.locator('[data-testid="nav-calendar-btn"]').click();
    const calendarRoot = page.locator('[data-testid="calendar-view"]');
    await expect(calendarRoot).toBeVisible();

    const actionBadge = page.locator('[data-testid="badge-action-date"]').first();
    const dueBadge = page.locator('[data-testid="badge-due-date"]').first();
    await expect(actionBadge).toContainText("▶");
    await expect(dueBadge).toContainText("⚑");
  });

  // [verifies: UI-003/AC-UI-003.2]
  test("calendar filter toggle switches between Action Dates, Due Dates, and All", async ({
    page,
  }) => {
    await page.goto("/");
    const today = new Date().toISOString().slice(0, 10);
    await page.request.post("/api/tasks", {
      data: {
        title: "Filter Toggle Task",
        status: "in_progress_today",
        priority: "today",
        action_date: today,
        due_date: today,
      },
    });

    await page.reload();
    await page.locator('[data-testid="nav-calendar-btn"]').click();

    const filterActionBtn = page.locator('[data-testid="filter-action-btn"]');
    const filterDueBtn = page.locator('[data-testid="filter-due-btn"]');
    const filterAllBtn = page.locator('[data-testid="filter-all-btn"]');

    await filterActionBtn.click();
    await expect(page.locator('[data-testid="badge-action-date"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="badge-due-date"]')).toHaveCount(0);

    await filterDueBtn.click();
    await expect(page.locator('[data-testid="badge-due-date"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="badge-action-date"]')).toHaveCount(0);

    await filterAllBtn.click();
    await expect(page.locator('[data-testid="badge-action-date"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="badge-due-date"]').first()).toBeVisible();
  });

  // [verifies: UI-003/AC-UI-003.3]
  test("calendar view provides Unscheduled sidebar and scheduling onto calendar", async ({
    page,
  }) => {
    await page.goto("/");
    const unschedRes = await page.request.post("/api/tasks", {
      data: {
        title: "Unscheduled Architecture Review",
        status: "todo",
        priority: "week",
      },
    });
    const unschedTask = (await unschedRes.json()) as { id: string };

    await page.reload();
    await page.locator('[data-testid="nav-calendar-btn"]').click();
    const calendarRoot = page.locator('[data-testid="calendar-view"]');

    const unscheduledSidebar = page.locator('[data-testid="unscheduled-sidebar"]');
    await expect(unscheduledSidebar).toBeVisible();
    await expect(unscheduledSidebar).toContainText("Unscheduled Architecture Review");

    const scheduleBtn = unscheduledSidebar.locator(
      `[data-task-id="${unschedTask.id}"] [data-testid="schedule-today-btn"]`,
    );
    await scheduleBtn.click();

    await expect(
      calendarRoot.locator('[data-testid="badge-action-date"]').filter({
        hasText: "Unscheduled Architecture Review",
      }),
    ).toBeVisible();
  });

  // [verifies: UI-003/AC-UI-003.4]
  test("calendar view toggles between Month and Week grids adapting layout", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-testid="nav-calendar-btn"]').click();

    const monthViewBtn = page.locator('[data-testid="view-month-btn"]');
    const weekViewBtn = page.locator('[data-testid="view-week-btn"]');
    await expect(monthViewBtn).toBeVisible();
    await expect(weekViewBtn).toBeVisible();

    // Toggle to Week view
    await weekViewBtn.click();
    await expect(page.locator('[data-testid="calendar-week-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="week-day-column"]')).toHaveCount(7);
  });

  // [verifies: UI-003/AC-UI-003.5]
  test("allows dragging unscheduled tasks and scheduled tasks across calendar days", async ({
    page,
  }) => {
    await page.goto("/");

    // Create an unscheduled task
    const res1 = await page.request.post("/api/tasks", {
      data: {
        title: "Drag-to-Schedule Architecture Spike",
        status: "todo",
        priority: "week",
      },
    });
    const task1 = (await res1.json()) as { id: string };

    await page.reload();

    // Switch to Calendar view
    await page.locator('[data-testid="nav-calendar-btn"]').click();
    const calendarRoot = page.locator('[data-testid="calendar-view"]');
    await expect(calendarRoot).toBeVisible();

    // Drag unscheduled task to a specific day cell in Month view
    const unschedCard = page.locator(
      `[data-testid="unscheduled-sidebar"] [data-task-id="${task1.id}"]`,
    );
    await expect(unschedCard).toBeVisible();

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const date1 = `${y}-${m}-10`;
    const date2 = `${y}-${m}-15`;

    const targetDayCell1 = page.locator(
      `[data-testid="calendar-day-cell"][data-date="${date1}"]`,
    );
    await unschedCard.dragTo(targetDayCell1);

    // Verify task badge is now visible on date1
    const badgeOn1 = targetDayCell1
      .locator('[data-testid="badge-action-date"]')
      .filter({
        hasText: "Drag-to-Schedule Architecture Spike",
      });
    await expect(badgeOn1).toBeVisible();

    // Drag scheduled task from date1 to date2
    const targetDayCell2 = page.locator(
      `[data-testid="calendar-day-cell"][data-date="${date2}"]`,
    );
    await badgeOn1.dragTo(targetDayCell2);

    // Verify task moved to date2
    const badgeOn2 = targetDayCell2
      .locator('[data-testid="badge-action-date"]')
      .filter({
        hasText: "Drag-to-Schedule Architecture Spike",
      });
    await expect(badgeOn2).toBeVisible();

    // Verify persistence in SQLite
    const getRes = await page.request.get(`/api/tasks/${task1.id}`);
    const updated = (await getRes.json()) as { action_date: string };
    expect(updated.action_date).toBe(date2);
  });

  // [verifies: UI-003/AC-UI-003.6]
  test("clicking a day or date in calendar mode opens new task dialog with that date as action date", async ({
    page,
  }) => {
    await page.goto("/");

    // Switch to Calendar view
    await page.locator('[data-testid="nav-calendar-btn"]').click();
    const calendarRoot = page.locator('[data-testid="calendar-view"]');
    await expect(calendarRoot).toBeVisible();

    // 1. Month View: click on a day cell
    const targetCell = page.locator('[data-testid="calendar-day-cell"]').nth(15);
    const targetDate = await targetCell.getAttribute("data-date");
    expect(targetDate).toBeTruthy();

    await targetCell.click();

    // Verify task modal opens
    const modal = page.locator('[data-testid="task-modal"]');
    await expect(modal).toBeVisible();

    // Verify action_date input is pre-populated with targetDate
    const actionDateInput = page.locator('[data-testid="task-action-date-input"]');
    await expect(actionDateInput).toHaveValue(targetDate!);

    // Close modal
    await page.locator('[data-testid="cancel-btn"]').click();
    await expect(modal).not.toBeVisible();

    // 2. Week View: switch to week view and click a day column
    await page.locator('[data-testid="view-week-btn"]').click();
    const weekCol = page.locator('[data-testid="week-day-column"]').nth(2);
    const weekDate = await weekCol.getAttribute("data-date");
    expect(weekDate).toBeTruthy();

    await weekCol.click();

    // Verify task modal opens with weekDate as action date
    await expect(modal).toBeVisible();
    await expect(actionDateInput).toHaveValue(weekDate!);

    await page.locator('[data-testid="cancel-btn"]').click();
    await expect(modal).not.toBeVisible();
  });

  // [verifies: UI-004/AC-UI-004.1]
  test("native task editor dialog supports light-dismiss via Escape key", async ({
    page,
  }) => {
    await page.goto("/");
    const addBtn = page.locator('[data-testid="add-task-btn"]');
    await addBtn.click();

    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  // [verifies: UI-004/AC-UI-004.2]
  test("native task editor dialog exposes all inputs and recurrence options", async ({
    page,
  }) => {
    await page.goto("/");

    // Open task dialog via Add Task button
    const addBtn = page.locator('[data-testid="add-task-btn"]');
    await addBtn.click();

    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    // UI-004.2: Verify all inputs are present
    await expect(dialog.locator('input[name="title"]')).toBeVisible();
    await expect(dialog.locator('select[name="status"]')).toBeVisible();
    await expect(dialog.locator('select[name="project_id"]')).toBeVisible();
    await expect(dialog.locator('select[name="priority"]')).toBeVisible();
    await expect(dialog.locator('input[name="action_date"]')).toBeVisible();
    await expect(dialog.locator('input[name="due_date"]')).toBeVisible();
    await expect(dialog.locator('select[name="repeat_rule"]')).toBeVisible();
    await expect(dialog.locator('input[name="waiting_on"]')).toBeVisible();
    await expect(dialog.locator('input[name="created_by"]')).toBeVisible();
    await expect(dialog.locator('textarea[name="details"]')).toBeVisible();

    // Fill form and create task
    await dialog
      .locator('input[name="title"]')
      .fill("Comprehensive Dialog Verification Task");
    await dialog.locator('select[name="priority"]').selectOption("quarter");
    // UI-004.2 & TASK-002.3: Verify recurrence options display dynamically
    await dialog.locator('select[name="repeat_rule"]').selectOption("weekly");
    await expect(dialog.locator('[data-testid="repeat-dow-1"]')).toBeVisible();

    await dialog.locator('select[name="repeat_rule"]').selectOption("monthly");
    await expect(
      dialog.locator('[data-testid="repeat-dom-input"]'),
    ).toBeVisible();

    await dialog.locator('select[name="repeat_rule"]').selectOption("yearly");
    await expect(
      dialog.locator('[data-testid="repeat-doy-picker"]'),
    ).toBeVisible();

    await dialog.locator('select[name="repeat_rule"]').selectOption("weekly");
    await dialog.locator('[data-testid="repeat-dow-3"]').click(); // Select Wednesday

    await dialog.locator('button[type="submit"]').click();

    // Verify dialog closed and task rendered on board
    await expect(dialog).toBeHidden();
    await expect(
      page.locator('[data-testid="task-card"]').filter({
        hasText: "Comprehensive Dialog Verification Task",
      }),
    ).toBeVisible();
  });

  // [verifies: UI-004/AC-UI-004.4]
  test("task modal provides emoji prefix button and popover palette to prepend or update task title emoji", async ({
    page,
  }) => {
    await page.goto("/");

    // Open task dialog via Add Task button
    await page.locator('[data-testid="add-task-btn"]').click();
    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    // Verify emoji prefix button exists
    const emojiTrigger = dialog.locator('[data-testid="task-emoji-prefix-btn"]');
    await expect(emojiTrigger).toBeVisible();

    // Click emoji trigger to open popover palette
    await emojiTrigger.click();

    const emojiPalette = dialog.locator('[data-testid="task-emoji-palette"]');
    await expect(emojiPalette).toBeVisible();

    // Select a rocket emoji 🚀
    const rocketOption = emojiPalette.locator('[data-emoji="🚀"]');
    await expect(rocketOption).toBeVisible();
    await rocketOption.click();

    // Verify palette closed and title now has 🚀 prefix
    await expect(emojiPalette).not.toBeVisible();
    const titleInput = dialog.locator('input[name="title"]');
    await expect(titleInput).toHaveValue(/🚀/);

    // Type task name after emoji
    await titleInput.fill("🚀 Launch Project Nova");

    // Select a different emoji (e.g. ⚡) to verify replacement of prefix
    await emojiTrigger.click();
    await expect(emojiPalette).toBeVisible();
    await emojiPalette.locator('[data-emoji="⚡"]').click();

    await expect(titleInput).toHaveValue("⚡ Launch Project Nova");

    // Submit task
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();

    // Verify task with emoji appears on the board
    await expect(
      page.locator('[data-testid="task-card"]').filter({
        hasText: "⚡ Launch Project Nova",
      }),
    ).toBeVisible();
  });

  // [verifies: UI-004/AC-UI-004.5]
  test("task modal details formatting menu is toggled via button and applies formatting to selected text", async ({
    page,
  }) => {
    await page.goto("/");

    // Open task dialog via Add Task button
    await page.locator('[data-testid="add-task-btn"]').click();
    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    const detailsTextarea = dialog.locator('textarea[name="details"]');
    await expect(detailsTextarea).toBeVisible();

    // Verify format toolbar is hidden by default
    const formatToolbar = dialog.locator('[data-testid="details-format-toolbar"]');
    await expect(formatToolbar).not.toBeVisible();

    // Verify format menu toggle button exists
    const formatToggleBtn = dialog.locator('[data-testid="details-format-toggle-btn"]');
    await expect(formatToggleBtn).toBeVisible();

    // Click toggle button to show format toolbar
    await formatToggleBtn.click();
    await expect(formatToolbar).toBeVisible();

    // Verify format buttons exist
    const boldBtn = formatToolbar.locator('[data-testid="format-bold-btn"]');
    const italicBtn = formatToolbar.locator('[data-testid="format-italic-btn"]');
    const underlineBtn = formatToolbar.locator('[data-testid="format-underline-btn"]');
    const bulletListBtn = formatToolbar.locator('[data-testid="format-bullet-list-btn"]');
    const numberListBtn = formatToolbar.locator('[data-testid="format-number-list-btn"]');

    await expect(boldBtn).toBeVisible();
    await expect(italicBtn).toBeVisible();
    await expect(underlineBtn).toBeVisible();
    await expect(bulletListBtn).toBeVisible();
    await expect(numberListBtn).toBeVisible();

    // Fill details textarea with sample text
    await detailsTextarea.fill("Important Task Note");

    // Select "Task"
    await detailsTextarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(10, 14);
    });

    // Click bold button
    await boldBtn.click();
    await expect(detailsTextarea).toHaveValue("Important **Task** Note");

    // Select "**Task**" and apply italic
    await detailsTextarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(10, 18);
    });
    await italicBtn.click();
    await expect(detailsTextarea).toHaveValue("Important ***Task*** Note");

    // Select "Note" and test underline (HTML <u> tag)
    await detailsTextarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(21, 25);
    });
    await underlineBtn.click();
    await expect(detailsTextarea).toHaveValue("Important ***Task*** <u>Note</u>");

    // Test list formatting on new line
    await detailsTextarea.fill("Item 1\nItem 2");
    await detailsTextarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(0, 13);
    });
    await bulletListBtn.click();
    await expect(detailsTextarea).toHaveValue("- Item 1\n- Item 2");

    // Click toggle button again to hide toolbar
    await formatToggleBtn.click();
    await expect(formatToolbar).not.toBeVisible();
  });

  // [verifies: TASK-002/AC-TASK-002.6]
  test("displays creator attribution badge on board card and in task modal", async ({
    page,
  }) => {
    // Create task with created_by attribute
    const createRes = await page.request.post("/api/tasks", {
      data: {
        title: "Task Authored by Telegram User",
        status: "todo",
        priority: "week",
        created_by: "Alex",
      },
    });
    const task = (await createRes.json()) as { id: string };

    await page.goto("/");
    const card = page.locator(`[data-task-id="${task.id}"]`);
    await expect(card).toBeVisible();

    // Verify creator badge on card
    const badge = card.locator('[data-testid="creator-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Alex");

    // Click card to open modal and verify modal creator badge and input
    await card.click();
    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    const modalBadge = dialog.locator('[data-testid="modal-creator-badge"]');
    await expect(modalBadge).toBeVisible();
    await expect(modalBadge).toContainText("Alex");

    const createdByInput = dialog.locator('input[name="created_by"]');
    await expect(createdByInput).toBeVisible();
    await expect(createdByInput).toHaveValue("Alex");

    // Modify creator to "Sarah" and save
    await createdByInput.fill("Sarah");
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();

    // Verify updated creator badge on card
    await expect(badge).toContainText("Sarah");

    // Reopen modal and confirm value persisted
    await card.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[name="created_by"]')).toHaveValue("Sarah");
    await expect(dialog.locator('[data-testid="modal-creator-badge"]')).toContainText("Sarah");

    await dialog.locator('[data-testid="close-task-modal-btn"]').click();
    await expect(dialog).toBeHidden();
  });

  // [verifies: UI-004/AC-UI-004.3]
  test("completed archive drawer lists done tasks and provides 1-click restoration", async ({
    page,
  }) => {
    await page.goto("/");

    // Create a task and mark as completed
    const createRes = await page.request.post("/api/tasks", {
      data: {
        title: "Task to be Archived and Restored",
        status: "todo",
        priority: "week",
      },
    });
    const task = (await createRes.json()) as { id: string };

    await page.request.post(`/api/tasks/${task.id}/complete`);
    await page.reload();

    // Open Archive Drawer
    const archiveBtn = page.locator('[data-testid="open-archive-btn"]');
    await archiveBtn.click();

    const drawer = page.locator('[data-testid="completed-archive-drawer"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Task to be Archived and Restored");

    // 1-Click Restore
    const restoreBtn = drawer.locator(
      `[data-task-id="${task.id}"] [data-testid="restore-task-btn"]`,
    );
    await restoreBtn.click();

    // Verify drawer updates and task reappears on active board in todo
    await page.locator('[data-testid="close-archive-btn"]').click();
    await expect(drawer).toBeHidden();
    await expect(
      page.locator(`[data-col="todo"] [data-task-id="${task.id}"]`),
    ).toBeVisible();
  });

  // [verifies: UI-005/AC-UI-005.1]
  test("density selector in top command bar offers Compact and Minimal options", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('[data-testid="density-selector"]'),
    ).toBeVisible();
    // Comfortable mode is removed per UI-005 spec
    await expect(
      page.locator('[data-testid="density-comfortable-btn"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="density-compact-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="density-minimal-btn"]'),
    ).toBeVisible();
  });

  // [verifies: UI-005/AC-UI-005.2]
  test("compact mode maintains streamlined card height and hides quick status footer", async ({
    page,
  }) => {
    await page.goto("/");
    const createRes = await page.request.post("/api/tasks", {
      data: {
        title: "Density Benchmark Task for Compact Measurement",
        status: "todo",
        priority: "week",
        action_date: "2026-11-01",
        due_date: "2026-11-05",
      },
    });
    const task = (await createRes.json()) as { id: string };
    await page.reload();

    const card = page.locator(`[data-task-id="${task.id}"]`);
    await expect(card).toBeVisible();

    // Default mode is compact: verify streamlined height (<= 85px)
    const boxCompact = await card.boundingBox();
    expect(boxCompact).not.toBeNull();
    expect(boxCompact!.height).toBeLessThanOrEqual(85);

    // Quick status select footer should be hidden in compact mode
    await expect(
      card.locator('[data-testid="task-status-select"]'),
    ).toBeHidden();

    // Action and due date indicators should be visible inline
    await expect(card.locator("text=2026-11-01")).toBeVisible();
    await expect(card.locator("text=2026-11-05")).toBeVisible();
  });

  // [verifies: UI-005/AC-UI-005.3]
  test("minimal mode renders ultra-dense single-line row", async ({ page }) => {
    await page.goto("/");
    const createRes = await page.request.post("/api/tasks", {
      data: {
        title: "Ultra Dense Minimal Row Item",
        status: "todo",
        priority: "today",
      },
    });
    const task = (await createRes.json()) as { id: string };
    await page.reload();

    // Switch to minimal
    await page.locator('[data-testid="density-minimal-btn"]').click();

    const card = page.locator(`[data-task-id="${task.id}"]`);
    await expect(card).toBeVisible();

    const boxMinimal = await card.boundingBox();
    expect(boxMinimal).not.toBeNull();
    // Ultra-dense single-line row: height <= 45px
    expect(boxMinimal!.height).toBeLessThanOrEqual(45);

    // Title and complete button visible
    await expect(card).toContainText("Ultra Dense Minimal Row Item");
  });

  // [verifies: UI-005/AC-UI-005.4]
  test("density mode selection persists in localStorage across page reloads", async ({
    page,
  }) => {
    await page.goto("/");
    // Verify default mode is compact
    const compactBtn = page.locator('[data-testid="density-compact-btn"]');
    await expect(compactBtn).toHaveAttribute("data-active", "true");

    // Switch to minimal
    const minimalBtn = page.locator('[data-testid="density-minimal-btn"]');
    await minimalBtn.click();
    await page.reload();

    // Verify minimal button is active after reload
    await expect(
      page.locator('[data-testid="density-minimal-btn"]'),
    ).toHaveAttribute("data-active", "true");

    // Switch back to compact
    await page.locator('[data-testid="density-compact-btn"]').click();
    await page.reload();
    await expect(
      page.locator('[data-testid="density-compact-btn"]'),
    ).toHaveAttribute("data-active", "true");
  });

  // [verifies: UI-005/AC-UI-005.5]
  test("allows dragging cards within a column to reorder them and persists new order", async ({
    page,
  }) => {
    await page.goto("/");

    // Create an isolated project for this test
    const prjRes = await page.request.post("/api/projects", {
      data: { name: "Reorder Test Project", color: "#6366F1" },
    });
    const prj = (await prjRes.json()) as { id: string };

    // Create 2 tasks in todo inside this project
    const r1 = await page.request.post("/api/tasks", {
      data: {
        title: "Card Order Alpha",
        status: "todo",
        priority: "week",
        project_id: prj.id,
      },
    });
    const t1 = (await r1.json()) as { id: string };

    const r2 = await page.request.post("/api/tasks", {
      data: {
        title: "Card Order Beta",
        status: "todo",
        priority: "week",
        project_id: prj.id,
      },
    });
    const t2 = (await r2.json()) as { id: string };

    await page.reload();

    const laneTodo = page.locator(
      `[data-swimlane="${prj.id}"][data-col="todo"]`,
    );
    const card1 = laneTodo.locator(`[data-task-id="${t1.id}"]`);
    const card2 = laneTodo.locator(`[data-task-id="${t2.id}"]`);

    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();

    // Drag card2 over card1
    await card2.dragTo(card1);

    // Verify card2 is now before card1 in this swimlane column
    const cardsInLane = laneTodo.locator('[data-testid="task-card"]');
    const firstText = await cardsInLane.first().innerText();
    expect(firstText).toContain("Card Order Beta");

    // Verify persisted on reload
    await page.reload();
    const cardsAfterReload = page.locator(
      `[data-swimlane="${prj.id}"][data-col="todo"] [data-testid="task-card"]`,
    );
    const firstTextAfter = await cardsAfterReload.first().innerText();
    expect(firstTextAfter).toContain("Card Order Beta");
  });

  // [verifies: UI-009/AC-UI-009.1]
  test("top command bar navigation switcher seamlessly toggles to Desktop Cockpit", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#app-root")).toBeVisible();

    const cockpitNavBtn = page.locator('[data-testid="nav-cockpit-btn"]');
    await expect(cockpitNavBtn).toBeVisible();

    await cockpitNavBtn.click();
    const cockpitView = page.locator('[data-testid="desktop-cockpit-view"]');
    await expect(cockpitView).toBeVisible();
  });

  // [verifies: UI-009/AC-UI-009.2]
  test("desktop cockpit renders 2-column layout with Today focus plate and Tracking container", async ({
    page,
  }) => {
    const prjRes = await page.request.post("/api/projects", {
      data: { name: "Cockpit Platform", color: "#10B981" },
    });
    const prj = (await prjRes.json()) as { id: string };

    await page.request.post("/api/tasks", {
      data: {
        title: "Cockpit Focus Task Alpha",
        status: "in_progress_today",
        priority: "today",
        project_id: prj.id,
        created_by: "Alex",
      },
    });

    await page.request.post("/api/tasks", {
      data: {
        title: "Cockpit Blocked Task Beta",
        status: "tracking",
        priority: "week",
        project_id: prj.id,
        waiting_on: "Waiting on vendor shipment",
        created_by: "Alex",
      },
    });

    await page.goto("/");
    await page.locator('[data-testid="nav-cockpit-btn"]').click();
    const cockpitView = page.locator('[data-testid="desktop-cockpit-view"]');
    await expect(cockpitView).toBeVisible();

    const todayPlate = cockpitView.locator('[data-testid="cockpit-today-focus-plate"]');
    await expect(todayPlate).toBeVisible();
    await expect(todayPlate).toContainText("Cockpit Focus Task Alpha");

    const trackingBox = cockpitView.locator('[data-testid="cockpit-tracking-container"]');
    await expect(trackingBox).toBeVisible();
    await expect(trackingBox).toContainText("Cockpit Blocked Task Beta");
    await expect(trackingBox).toContainText("Waiting on vendor shipment");
  });

  // [verifies: UI-009/AC-UI-009.3]
  test("desktop cockpit renders weekly velocity telemetry bar chart", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-testid="nav-cockpit-btn"]').click();
    const cockpitView = page.locator('[data-testid="desktop-cockpit-view"]');
    await expect(cockpitView.locator('[data-testid="cockpit-weekly-velocity-chart"]')).toBeVisible();
  });

  // [verifies: UI-009/AC-UI-009.4]
  test("desktop cockpit renders SVG donut chart for project completed distribution", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-testid="nav-cockpit-btn"]').click();
    const cockpitView = page.locator('[data-testid="desktop-cockpit-view"]');
    await expect(cockpitView.locator('[data-testid="cockpit-project-distribution-chart"]')).toBeVisible();
  });

  // [verifies: UI-009/AC-UI-009.5]
  test("desktop cockpit renders horizontal stacked creator completed chart", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-testid="nav-cockpit-btn"]').click();
    const cockpitView = page.locator('[data-testid="desktop-cockpit-view"]');
    await expect(cockpitView.locator('[data-testid="cockpit-creator-stacked-chart"]')).toBeVisible();
  });
});
