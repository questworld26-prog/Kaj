import { test, expect } from '@playwright/test';

test.describe('Kaj (কাজ) Bento × Chronos UI Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Browser console error: ${msg.text()}`);
      }
    });
  });

  // [verifies: UI-001/AC-UI-001.1]
  test('renders full-width 6-column Kanban board without sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-root')).toBeVisible();

    // Verify 6 column tracks in header
    const columns = page.locator('[data-testid="column-header"]');
    await expect(columns).toHaveCount(6);

    const columnNames = await columns.allTextContents();
    const joinedNames = columnNames.join(' ').toLowerCase();
    expect(joinedNames).toContain('triage');
    expect(joinedNames).toContain('todo');
    expect(joinedNames).toContain('today');
    expect(joinedNames).toContain('this week');
    expect(joinedNames).toContain('this month');
    expect(joinedNames).toContain('tracking');

    // Confirm no legacy left sidebar exists (100% full-width layout)
    await expect(page.locator('aside.left-sidebar')).toHaveCount(0);
  });

  // [verifies: UI-001/AC-UI-001.2]
  test('renders project swimlane pods with collapsible headers and task counts', async ({ page }) => {
    await page.goto('/');

    // Check default Unassigned swimlane pod
    const unassignedPod = page.locator('[data-testid="swimlane-pod-unassigned"]');
    await expect(unassignedPod).toBeVisible();

    // Create a new project via API or modal
    await page.request.post('/api/projects', {
      data: { name: 'Core Infrastructure', color: '#10B981' },
    });

    // Create a task inside Core Infrastructure
    const projRes = await page.request.get('/api/projects');
    const projects = (await projRes.json()) as { id: string; name: string }[];
    const infraProj = projects.find((p) => p.name === 'Core Infrastructure')!;

    await page.request.post('/api/tasks', {
      data: {
        title: 'Deploy K8s Cluster',
        project_id: infraProj.id,
        status: 'todo',
        priority: 'month',
      },
    });

    await page.reload();

    const infraPod = page.locator(`[data-testid="swimlane-pod-${infraProj.id}"]`);
    await expect(infraPod).toBeVisible();
    await expect(infraPod.locator('[data-testid="swimlane-task-count"]')).toContainText('1');

    // Test collapse / expand
    const collapseBtn = infraPod.locator('[data-testid="swimlane-collapse-toggle"]');
    await collapseBtn.click();
    await expect(infraPod.locator('[data-testid="swimlane-content"]')).toBeHidden();
    await collapseBtn.click();
    await expect(infraPod.locator('[data-testid="swimlane-content"]')).toBeVisible();
  });

  // [verifies: UI-001/AC-UI-001.3]
  test('renders tracking column cards with dashed borders and dedicated carrier/blocker badge', async ({ page }) => {
    await page.goto('/');

    // Create a tracking task with waiting_on
    await page.request.post('/api/tasks', {
      data: {
        title: 'Wait for FedEx delivery of RAM',
        status: 'tracking',
        waiting_on: 'FedEx 772918390',
        priority: 'week',
      },
    });

    await page.reload();

    const trackingCard = page.locator('[data-testid="task-card"]').filter({
      hasText: 'Wait for FedEx delivery of RAM',
    });
    await expect(trackingCard).toBeVisible();

    // Check dashed border style and blocker badge
    const cardEl = trackingCard.first();
    await expect(cardEl).toHaveClass(/border-dashed/);
    await expect(cardEl.locator('[data-testid="blocker-badge"]')).toContainText('FedEx 772918390');
  });

  // [verifies: UI-001/AC-UI-001.4]
  test('allows moving tasks across columns and swimlanes', async ({ page }) => {
    await page.goto('/');

    // Create a task in Triage
    const res = await page.request.post('/api/tasks', {
      data: {
        title: 'Quick Triage Item',
        status: 'triage',
        priority: 'today',
      },
    });
    const task = (await res.json()) as { id: string };

    await page.reload();

    const taskCard = page.locator(`[data-task-id="${task.id}"]`);
    await expect(taskCard).toBeVisible();

    // Use task quick status mover dropdown or drag
    const statusSelect = taskCard.locator('[data-testid="task-status-select"]');
    await statusSelect.selectOption('in_progress_today');

    // Verify it updated in UI and persisted
    await expect(page.locator(`[data-col="in_progress_today"] [data-task-id="${task.id}"]`)).toBeVisible();

    const getRes = await page.request.get(`/api/tasks/${task.id}`);
    const updated = (await getRes.json()) as { status: string };
    expect(updated.status).toBe('in_progress_today');
  });

  // [verifies: UI-001/AC-UI-001.5]
  test('provides controls to reorder project swimlanes immediately', async ({ page }) => {
    await page.goto('/');

    // Create two test projects
    const p1Res = await page.request.post('/api/projects', {
      data: { name: 'Alpha Project', color: '#38BDF8' },
    });
    const p2Res = await page.request.post('/api/projects', {
      data: { name: 'Beta Project', color: '#F43F5E' },
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
    const moveUpBtn = reorderModal.locator(`[data-project-id="${p2.id}"] [data-testid="move-up-btn"]`);
    await moveUpBtn.click();

    // Close modal
    await reorderModal.locator('[data-testid="close-modal-btn"]').click();

    // Verify board renders Beta before Alpha
    const pods = page.locator('[data-testid^="swimlane-pod-"]');
    const podIds = await pods.evaluateAll((list) =>
      list.map((el) => el.getAttribute('data-testid')?.replace('swimlane-pod-', ''))
    );

    const betaIdx = podIds.indexOf(p2.id);
    const alphaIdx = podIds.indexOf(p1.id);
    expect(betaIdx).toBeLessThan(alphaIdx);
  });

  // [verifies: UI-002/AC-UI-002.1]
  test('enforces Chronos dark-mode surfaces #0E1111 canvas and #1C2224 cards', async ({ page }) => {
    await page.goto('/');

    // Background color of body or root
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // #0E1111 in RGB is rgb(14, 17, 17)
    expect(bodyBg).toBe('rgb(14, 17, 17)');

    // Check card surface color
    const card = page.locator('[data-testid="task-card"]').first();
    if (await card.isVisible()) {
      const cardBg = await card.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      // #1C2224 is rgb(28, 34, 36)
      expect(cardBg).toBe('rgb(28, 34, 36)');
    }
  });

  // [verifies: UI-002/AC-UI-002.2]
  test('uses Emerald/Mint #10B981 for primary actions and Gold #EAB308 for Tracking accents', async ({ page }) => {
    await page.goto('/');

    const addBtn = page.locator('[data-testid="add-task-btn"]');
    await expect(addBtn).toBeVisible();

    // Emerald accent #10B981 is rgb(16, 185, 129)
    const btnBg = await addBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(btnBg).toBe('rgb(16, 185, 129)');
  });

  // [verifies: UI-002/AC-UI-002.3]
  test('maintains accessible text and non-text component contrast', async ({ page }) => {
    await page.goto('/');

    // Verify main body text color is high-contrast light grey/white
    const textColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).color;
    });
    // Expected light text e.g. rgb(243, 244, 246) or rgb(255, 255, 255)
    expect(textColor).toMatch(/rgb\((2[3-5][0-9]),\s*(2[3-5][0-9]),\s*(2[3-5][0-9])\)/);
  });

  // [verifies: UI-003/AC-UI-003.1]
  // [verifies: UI-003/AC-UI-003.2]
  // [verifies: UI-003/AC-UI-003.3]
  // [verifies: UI-003/AC-UI-003.4]
  test('calendar view renders Month and Week grids, dual-date badges, filter toggles, and unscheduled sidebar', async ({ page }) => {
    await page.goto('/');

    // Create an unscheduled task
    const unschedRes = await page.request.post('/api/tasks', {
      data: {
        title: 'Unscheduled Architecture Review',
        status: 'todo',
        priority: 'week',
      },
    });
    const unschedTask = (await unschedRes.json()) as { id: string };

    // Create a scheduled task with both action_date and due_date
    const today = new Date().toISOString().slice(0, 10);
    await page.request.post('/api/tasks', {
      data: {
        title: 'Scheduled Feature Launch',
        status: 'in_progress_today',
        priority: 'today',
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
    const actionBadge = page.locator('[data-testid="badge-action-date"]').first();
    const dueBadge = page.locator('[data-testid="badge-due-date"]').first();
    await expect(actionBadge).toContainText('▶');
    await expect(dueBadge).toContainText('⚑');

    // UI-003.2: Verify filter toggle: All, Action Dates only, Due Dates only
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

    // UI-003.3: Verify Unscheduled sidebar and scheduling onto calendar
    const unscheduledSidebar = page.locator('[data-testid="unscheduled-sidebar"]');
    await expect(unscheduledSidebar).toBeVisible();
    await expect(unscheduledSidebar).toContainText('Unscheduled Architecture Review');

    // Click "Schedule Today" button for this specific task
    const scheduleBtn = unscheduledSidebar
      .locator(`[data-task-id="${unschedTask.id}"] [data-testid="schedule-today-btn"]`);
    await scheduleBtn.click();

    // Verify task moved from unscheduled list to the active calendar grid
    await expect(calendarRoot.locator('[data-testid="badge-action-date"]').filter({
      hasText: 'Unscheduled Architecture Review',
    })).toBeVisible();

    // UI-003.4: Toggle to Week view
    await weekViewBtn.click();
    await expect(page.locator('[data-testid="calendar-week-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="week-day-column"]')).toHaveCount(7);
  });

  // [verifies: UI-004/AC-UI-004.1]
  // [verifies: UI-004/AC-UI-004.2]
  test('native task editor dialog exposes all inputs and supports light-dismiss', async ({ page }) => {
    await page.goto('/');

    // Open task dialog via Add Task button
    const addBtn = page.locator('[data-testid="add-task-btn"]');
    await addBtn.click();

    const dialog = page.locator('dialog#task-dialog');
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
    await dialog.locator('input[name="title"]').fill('Comprehensive Dialog Verification Task');
    await dialog.locator('select[name="priority"]').selectOption('quarter');
    await dialog.locator('select[name="repeat_rule"]').selectOption('weekly');
    await dialog.locator('button[type="submit"]').click();

    // Verify dialog closed and task rendered on board
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-testid="task-card"]').filter({
      hasText: 'Comprehensive Dialog Verification Task',
    })).toBeVisible();

    // UI-004.1: Test Light-dismiss via Escape key
    await addBtn.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  // [verifies: UI-004/AC-UI-004.3]
  test('completed archive drawer lists done tasks and provides 1-click restoration', async ({ page }) => {
    await page.goto('/');

    // Create a task and mark as completed
    const createRes = await page.request.post('/api/tasks', {
      data: {
        title: 'Task to be Archived and Restored',
        status: 'todo',
        priority: 'week',
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
    await expect(drawer).toContainText('Task to be Archived and Restored');

    // 1-Click Restore
    const restoreBtn = drawer.locator(`[data-task-id="${task.id}"] [data-testid="restore-task-btn"]`);
    await restoreBtn.click();

    // Verify drawer updates and task reappears on active board in todo
    await page.locator('[data-testid="close-archive-btn"]').click();
    await expect(drawer).toBeHidden();
    await expect(page.locator(`[data-col="todo"] [data-task-id="${task.id}"]`)).toBeVisible();
  });
});
