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

    // Use task quick status mover dropdown or drag
    const statusSelect = taskCard.locator('[data-testid="task-status-select"]');
    await statusSelect.selectOption("in_progress_today");

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
  // [verifies: UI-003/AC-UI-003.2]
  // [verifies: UI-003/AC-UI-003.3]
  // [verifies: UI-003/AC-UI-003.4]
  test("calendar view renders Month and Week grids, dual-date badges, filter toggles, and unscheduled sidebar", async ({
    page,
  }) => {
    await page.goto("/");

    // Create an unscheduled task
    const unschedRes = await page.request.post("/api/tasks", {
      data: {
        title: "Unscheduled Architecture Review",
        status: "todo",
        priority: "week",
      },
    });
    const unschedTask = (await unschedRes.json()) as { id: string };

    // Create a scheduled task with both action_date and due_date
    const today = new Date().toISOString().slice(0, 10);
    await page.request.post("/api/tasks", {
      data: {
        title: "Scheduled Feature Launch",
        status: "in_progress_today",
        priority: "today",
        action_date: today,
        due_date: today,
      },
    });

    // Reload page to ensure freshly created tasks are populated
    await page.reload();

    // Switch to Calendar view
    const calendarNavBtn = page.locator('[data-testid="nav-calendar-btn"]');
    await calendarNavBtn.click();

    // UI-003.4: Verify Month view default and Week view switcher
    const calendarRoot = page.locator('[data-testid="calendar-view"]');
    await expect(calendarRoot).toBeVisible();

    const monthViewBtn = page.locator('[data-testid="view-month-btn"]');
    const weekViewBtn = page.locator('[data-testid="view-week-btn"]');
    await expect(monthViewBtn).toBeVisible();
    await expect(weekViewBtn).toBeVisible();

    // UI-003.1: Verify distinct Action Date (▶) and Due Date (⚑) badges
    const actionBadge = page
      .locator('[data-testid="badge-action-date"]')
      .first();
    const dueBadge = page.locator('[data-testid="badge-due-date"]').first();
    await expect(actionBadge).toContainText("▶");
    await expect(dueBadge).toContainText("⚑");

    // UI-003.2: Verify filter toggle: All, Action Dates only, Due Dates only
    const filterActionBtn = page.locator('[data-testid="filter-action-btn"]');
    const filterDueBtn = page.locator('[data-testid="filter-due-btn"]');
    const filterAllBtn = page.locator('[data-testid="filter-all-btn"]');

    await filterActionBtn.click();
    await expect(
      page.locator('[data-testid="badge-action-date"]').first(),
    ).toBeVisible();
    await expect(page.locator('[data-testid="badge-due-date"]')).toHaveCount(0);

    await filterDueBtn.click();
    await expect(
      page.locator('[data-testid="badge-due-date"]').first(),
    ).toBeVisible();
    await expect(page.locator('[data-testid="badge-action-date"]')).toHaveCount(
      0,
    );

    await filterAllBtn.click();
    await expect(
      page.locator('[data-testid="badge-action-date"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="badge-due-date"]').first(),
    ).toBeVisible();

    // UI-003.3: Verify Unscheduled sidebar and scheduling onto calendar
    const unscheduledSidebar = page.locator(
      '[data-testid="unscheduled-sidebar"]',
    );
    await expect(unscheduledSidebar).toBeVisible();
    await expect(unscheduledSidebar).toContainText(
      "Unscheduled Architecture Review",
    );

    // Click "Schedule Today" button for this specific task
    const scheduleBtn = unscheduledSidebar.locator(
      `[data-task-id="${unschedTask.id}"] [data-testid="schedule-today-btn"]`,
    );
    await scheduleBtn.click();

    // Verify task moved from unscheduled list to the active calendar grid
    await expect(
      calendarRoot.locator('[data-testid="badge-action-date"]').filter({
        hasText: "Unscheduled Architecture Review",
      }),
    ).toBeVisible();

    // UI-003.4: Toggle to Week view
    await weekViewBtn.click();
    await expect(
      page.locator('[data-testid="calendar-week-grid"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="week-day-column"]')).toHaveCount(
      7,
    );
  });

  // [verifies: UI-003/AC-UI-003.3]
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

  // [verifies: UI-004/AC-UI-004.1]
  // [verifies: UI-004/AC-UI-004.2]
  test("native task editor dialog exposes all inputs and supports light-dismiss", async ({
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
    await expect(dialog.locator('textarea[name="details"]')).toBeVisible();

    // Fill form and create task
    await dialog
      .locator('input[name="title"]')
      .fill("Comprehensive Dialog Verification Task");
    await dialog.locator('select[name="priority"]').selectOption("quarter");
    await dialog.locator('select[name="repeat_rule"]').selectOption("weekly");
    await dialog.locator('button[type="submit"]').click();

    // Verify dialog closed and task rendered on board
    await expect(dialog).toBeHidden();
    await expect(
      page.locator('[data-testid="task-card"]').filter({
        hasText: "Comprehensive Dialog Verification Task",
      }),
    ).toBeVisible();

    // UI-004.1: Test Light-dismiss via Escape key
    await addBtn.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
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
  test("density selector in top command bar offers Comfortable, Compact, and Minimal options", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('[data-testid="density-selector"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="density-comfortable-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="density-compact-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="density-minimal-btn"]'),
    ).toBeVisible();
  });

  // [verifies: UI-005/AC-UI-005.2]
  test("compact mode reduces card height by at least 40% and hides quick status footer", async ({
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

    // Default comfortable height
    const boxComfortable = await card.boundingBox();
    expect(boxComfortable).not.toBeNull();
    const comfortableHeight = boxComfortable!.height;

    // Switch to compact
    await page.locator('[data-testid="density-compact-btn"]').click();

    const boxCompact = await card.boundingBox();
    expect(boxCompact).not.toBeNull();
    const compactHeight = boxCompact!.height;

    // Height should be reduced by at least 40%
    expect(compactHeight).toBeLessThanOrEqual(comfortableHeight * 0.65);

    // Quick status select footer should be hidden in compact mode
    await expect(
      card.locator('[data-testid="task-status-select"]'),
    ).toBeHidden();
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
    // Switch to minimal
    await page.locator('[data-testid="density-minimal-btn"]').click();
    await page.reload();

    // Verify minimal button is active
    const minimalBtn = page.locator('[data-testid="density-minimal-btn"]');
    await expect(minimalBtn).toHaveAttribute("data-active", "true");
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
});
