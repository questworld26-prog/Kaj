// [spec: UI-007]
import { test, expect } from "@playwright/test";

test.describe("Kaj (কাজ) Top Search & Mobile Density Default (UI-007)", () => {
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

  // [verifies: UI-007/AC-UI-007.1]
  test("renders search input on top bar for both desktop and mobile viewports", async ({
    page,
  }) => {
    // 1. Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const desktopSearch = page.locator(
      '[data-testid="desktop-task-search-input"]',
    );
    await expect(desktopSearch).toBeVisible();
    await expect(desktopSearch).toHaveAttribute(
      "placeholder",
      "Search tasks...",
    );

    // 2. Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const mobileSearch = page.locator(
      '[data-testid="mobile-task-search-input"]',
    );
    await expect(mobileSearch).toBeVisible();
    await expect(mobileSearch).toHaveAttribute(
      "placeholder",
      "Search tasks...",
    );
  });

  // [verifies: UI-007/AC-UI-007.2]
  test("filters Kanban board in real-time by title and description across swimlanes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Seed distinct tasks
    await page.request.post("/api/tasks", {
      data: {
        title: "Quantum Encryption Protocol",
        details: "Top secret cryptographic keys",
        status: "todo",
      },
    });
    await page.request.post("/api/tasks", {
      data: {
        title: "Database Backup Procedure",
        details: "Nightly automated dump to cold storage",
        status: "in_progress_today",
      },
    });
    await page.request.post("/api/tasks", {
      data: {
        title: "Frontend Styling Pass",
        details: "Review Quantum color palettes",
        status: "tracking",
      },
    });

    await page.goto("/");

    const searchInput = page.locator(
      '[data-testid="desktop-task-search-input"]',
    );

    // 1. Search by title match: "Encryption"
    await searchInput.fill("Encryption");
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Quantum Encryption Protocol" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Database Backup Procedure" }),
    ).toHaveCount(0);
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Frontend Styling Pass" }),
    ).toHaveCount(0);

    // 2. Search by description match: "cold storage" (matches Database Backup)
    await searchInput.fill("cold storage");
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Database Backup Procedure" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Quantum Encryption Protocol" }),
    ).toHaveCount(0);

    // 3. Search word appearing in title of one and details of another: "quantum" (case-insensitive)
    await searchInput.fill("quantum");
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Quantum Encryption Protocol" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Frontend Styling Pass" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="task-card"]')
        .filter({ hasText: "Database Backup Procedure" }),
    ).toHaveCount(0);
  });

  // [verifies: UI-007/AC-UI-007.3]
  test("filters Calendar view events in real-time by title and description", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    await page.request.post("/api/tasks", {
      data: {
        title: "Calendar Unique Alpha Event",
        details: "Important milestone discussion",
        action_date: todayStr,
      },
    });
    await page.request.post("/api/tasks", {
      data: {
        title: "Calendar Unique Beta Event",
        details: "Unrelated sync meeting",
        action_date: todayStr,
      },
    });

    await page.goto("/");
    // Switch to Calendar view
    await page.click('[data-testid="nav-calendar-btn"]');
    await expect(page.locator('[data-testid="calendar-view"]')).toBeVisible();

    const searchInput = page.locator(
      '[data-testid="desktop-task-search-input"]',
    );
    const calView = page.locator('[data-testid="calendar-view"]');

    // Search by title
    await searchInput.fill("Unique Alpha");
    await expect(
      calView.locator("text=Calendar Unique Alpha Event"),
    ).toBeVisible();
    await expect(
      calView.locator("text=Calendar Unique Beta Event"),
    ).toHaveCount(0);

    // Search by details: "sync meeting"
    await searchInput.fill("sync meeting");
    await expect(
      calView.locator("text=Calendar Unique Beta Event"),
    ).toBeVisible();
    await expect(
      calView.locator("text=Calendar Unique Alpha Event"),
    ).toHaveCount(0);
  });

  // [verifies: UI-007/AC-UI-007.4]
  test("provides clear button (✕) that restores unfiltered view immediately", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const searchInput = page.locator(
      '[data-testid="desktop-task-search-input"]',
    );
    const clearBtn = page.locator('[data-testid="desktop-search-clear-btn"]');

    // Initially clear button is hidden
    await expect(clearBtn).toBeHidden();

    // Type query
    await searchInput.fill("NonExistentTaskXYZ");
    await expect(clearBtn).toBeVisible();

    // Click clear button
    await clearBtn.click();
    await expect(searchInput).toHaveValue("");
    await expect(clearBtn).toBeHidden();
  });

  // [verifies: UI-007/AC-UI-007.5]
  test("defaults to Minimal card density on mobile viewports below 768px when no storage preference exists", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Ensure localStorage has no pre-existing density setting
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("kaj_card_density"));
    await page.reload();

    // On mobile, check density button or active density is minimal
    const densityToggle = page.locator('[data-testid="mobile-density-toggle"]');
    await expect(densityToggle).toBeVisible();
    await expect(densityToggle).toContainText("Minimal");
  });
});
