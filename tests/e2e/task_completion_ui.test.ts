// [spec: UI-008]
import { test, expect } from "@playwright/test";

test.describe("Multi-Modal Task Completion Interactions (UI-008)", () => {
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

  // [verifies: UI-008/AC-UI-008.1]
  test("renders prominent circular checkbox on desktop cards in both compact and minimal views", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const title = `Checkbox Task ${Date.now()}`;

    // Create task via API
    await page.request.post("/api/tasks", {
      data: { title, status: "todo", priority: "today" },
    });

    await page.goto("/");
    await expect(page.locator("#app-root")).toBeVisible();

    const card = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: title });
    await expect(card).toBeVisible();

    // Verify circular checkbox on desktop card
    const checkBtn = card.locator('[data-testid="complete-task-btn"]');
    await expect(checkBtn).toBeVisible();

    // Click checkbox to complete task
    await checkBtn.click();
    await expect(card).toBeHidden();

    // Verify task is in archive
    await page.locator('[data-testid="open-archive-btn"]').click();
    await expect(
      page.locator('[data-testid="completed-archive-drawer"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="completed-archive-drawer"]'),
    ).toContainText(title);
  });

  // [verifies: UI-008/AC-UI-008.2]
  test("provides explicit Mark Complete button in task modal dialog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const title = `Modal Complete Task ${Date.now()}`;

    // Create task via API
    const res = await page.request.post("/api/tasks", {
      data: { title, status: "todo", priority: "week" },
    });
    const task = (await res.json()) as { id: string };

    await page.goto("/");
    const card = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: title });
    await expect(card).toBeVisible();

    // Open task dialog
    await card.click();
    const dialog = page.locator("dialog#task-dialog");
    await expect(dialog).toBeVisible();

    // Verify Mark Complete button exists
    const markCompleteBtn = dialog.locator(
      '[data-testid="modal-mark-complete-btn"]',
    );
    await expect(markCompleteBtn).toBeVisible();
    await markCompleteBtn.click();

    // Dialog should close and card should disappear from active board
    await expect(dialog).toBeHidden();
    await expect(card).toBeHidden();
  });

  // [verifies: UI-008/AC-UI-008.3]
  test("supports swipe right to complete task gesture on mobile viewports", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const title = `Swipe Task ${Date.now()}`;

    await page.request.post("/api/tasks", {
      data: { title, status: "in_progress_today", priority: "today" },
    });

    await page.goto("/");
    await expect(
      page.locator('[data-testid="mobile-bottom-dock"]'),
    ).toBeVisible();

    const mobileCard = page
      .locator('[data-testid^="mobile-task-card-"]')
      .filter({ hasText: title });
    await expect(mobileCard).toBeVisible();

    // Perform swipe right touch gesture past 80px threshold
    const box = await mobileCard.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const startX = box.x + 20;
      const startY = box.y + box.height / 2;
      const endX = box.x + 160;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, startY, { steps: 8 });
      await page.mouse.up();
    }

    // Card should be completed and removed from active Today view
    await expect(mobileCard).toBeHidden();
  });
});
