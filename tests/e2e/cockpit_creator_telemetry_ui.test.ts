// [spec: UI-012]
import { test, expect, type APIRequestContext } from "@playwright/test";

function getRelativeLuminance(rgbStr: string): number {
  const match = rgbStr.match(/\d+/g);
  if (!match || match.length < 3) return 0;
  const [r, g, b] = match.slice(0, 3).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(c1: string, c2: string): number {
  const l1 = getRelativeLuminance(c1);
  const l2 = getRelativeLuminance(c2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

async function seedCompletedTask(
  request: APIRequestContext,
  title: string,
  createdBy: string,
): Promise<string> {
  const createRes = await request.post("/api/tasks", {
    data: {
      title,
      status: "todo",
      created_by: createdBy,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  const taskId: string = (created.task ?? created).id;

  const completeRes = await request.post(`/api/tasks/${taskId}/complete`);
  expect(completeRes.ok()).toBeTruthy();
  return taskId;
}

test.describe("Kaj (কাজ) Cockpit Creator Stacked Telemetry (UI-012)", () => {
  const pageErrors: string[] = [];
  const createdTaskIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors.length = 0;
    createdTaskIds.length = 0;

    page.on("pageerror", (err) => {
      pageErrors.push(`Page error: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        pageErrors.push(`Browser console error: ${msg.text()}`);
      }
    });
  });

  test.afterEach(async ({ page, request }) => {
    for (const id of createdTaskIds) {
      await request.delete(`/api/tasks/${id}`);
    }
    expect(pageErrors).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // [verifies: UI-012/AC-UI-012.1]
  test("positions Stacked Completed Tasks by Creator chart vertically above Tasks Completed by Week chart", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-cockpit-btn").click();

    const creatorChart = page.getByTestId("cockpit-creator-stacked-chart");
    const velocityChart = page.getByTestId("cockpit-weekly-velocity-chart");

    await expect(creatorChart).toBeVisible();
    await expect(velocityChart).toBeVisible();
    await expect(velocityChart).toContainText("Tasks Completed by Week");

    const creatorBox = await creatorChart.boundingBox();
    const velocityBox = await velocityChart.boundingBox();
    expect(creatorBox).not.toBeNull();
    expect(velocityBox).not.toBeNull();
    expect(creatorBox!.y + creatorBox!.height).toBeLessThan(velocityBox!.y);
  });

  // [verifies: UI-012/AC-UI-012.2]
  test("orders weekly stacked bar rows with the latest current week on top and older weeks below", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    createdTaskIds.push(
      await seedCompletedTask(request, `UI012 Row Order ${suffix}`, `Lead_${suffix}`),
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-cockpit-btn").click();

    const creatorChart = page.getByTestId("cockpit-creator-stacked-chart");
    const rows = creatorChart.getByTestId("creator-stacked-week-row");
    await expect(rows).toHaveCount(3);

    const firstRowBox = await rows.nth(0).boundingBox();
    const secondRowBox = await rows.nth(1).boundingBox();
    const thirdRowBox = await rows.nth(2).boundingBox();
    expect(firstRowBox).not.toBeNull();
    expect(secondRowBox).not.toBeNull();
    expect(thirdRowBox).not.toBeNull();

    // First rendered row is visually on top and represents the current week
    expect(firstRowBox!.y).toBeLessThan(secondRowBox!.y);
    expect(secondRowBox!.y).toBeLessThan(thirdRowBox!.y);
    await expect(rows.nth(0)).toContainText("(Current)");
    await expect(rows.nth(1)).not.toContainText("(Current)");
    await expect(rows.nth(2)).not.toContainText("(Current)");
  });

  // [verifies: UI-012/AC-UI-012.3]
  test("displays each creator (created_by) completed task count inside its colored bar segment with >= 4.5:1 contrast", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    const creatorAlpha = `Alpha_${suffix}`;
    const creatorBeta = `Beta_${suffix}`;

    for (let i = 1; i <= 3; i++) {
      createdTaskIds.push(
        await seedCompletedTask(request, `UI012 A${i} ${suffix}`, creatorAlpha),
      );
    }
    for (let i = 1; i <= 2; i++) {
      createdTaskIds.push(
        await seedCompletedTask(request, `UI012 B${i} ${suffix}`, creatorBeta),
      );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-cockpit-btn").click();

    const currentRow = page
      .getByTestId("cockpit-creator-stacked-chart")
      .getByTestId("creator-stacked-week-row")
      .nth(0);

    const alphaSeg = currentRow.locator(
      `[data-testid="creator-bar-segment"][data-creator="${creatorAlpha}"]`,
    );
    const betaSeg = currentRow.locator(
      `[data-testid="creator-bar-segment"][data-creator="${creatorBeta}"]`,
    );

    await expect(alphaSeg).toBeVisible();
    await expect(betaSeg).toBeVisible();
    await expect(alphaSeg).toHaveText("3 (60%)");
    await expect(betaSeg).toHaveText("2 (40%)");

    const alphaBox = await alphaSeg.boundingBox();
    const betaBox = await betaSeg.boundingBox();
    expect(alphaBox).not.toBeNull();
    expect(betaBox).not.toBeNull();
    expect(alphaBox!.height).toBeGreaterThanOrEqual(20);
    expect(betaBox!.height).toBeGreaterThanOrEqual(20);

    for (const seg of [alphaSeg, betaSeg]) {
      const styles = await seg.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { color: cs.color, backgroundColor: cs.backgroundColor };
      });
      expect(
        getContrastRatio(styles.color, styles.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
