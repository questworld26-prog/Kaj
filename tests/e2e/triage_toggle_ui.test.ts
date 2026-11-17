// [spec: UI-011]
import { test, expect, type APIRequestContext } from "@playwright/test";

function getSafeNonCurrentWeekSameMonthDateStr(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ...
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  // Pick the Monday right after the current Monday-Sunday week so it is strictly future & outside this week
  const nextWeekMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilSunday + 1,
  );
  const year = nextWeekMonday.getFullYear();
  const month = String(nextWeekMonday.getMonth() + 1).padStart(2, "0");
  const day = String(nextWeekMonday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function seedProject(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await request.post("/api/projects", {
    data: { name },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.project ?? body;
}

async function seedTask(
  request: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<{ id: string; title: string; status: string }> {
  const res = await request.post("/api/tasks", {
    data: payload,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.task ?? body;
}

test.describe("Kaj (কাজ) Global Repeating Triage Visibility Toggle (UI-011)", () => {
  const pageErrors: string[] = [];
  const createdTaskIds: string[] = [];
  const createdProjectIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors.length = 0;
    createdTaskIds.length = 0;
    createdProjectIds.length = 0;

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
    for (const id of createdProjectIds) {
      await request.delete(`/api/projects/${id}`);
    }
    expect(pageErrors).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // [verifies: UI-011/AC-UI-011.1]
  test("renders accessible toggle button with aria-pressed semantics in desktop Triage header and mobile triage and pods views", async ({
    page,
  }) => {
    // Desktop Kanban Board
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-board-btn").click();

    const triageHeader = page
      .getByTestId("column-header")
      .filter({ hasText: "Triage" })
      .first();
    await expect(triageHeader).toBeVisible();

    const desktopToggle = page.getByTestId("hide-repeating-triage-toggle");
    await expect(desktopToggle).toBeVisible();
    await expect(desktopToggle).toHaveAttribute("aria-pressed", "false");

    const toggleBox = await desktopToggle.boundingBox();
    const headerBox = await triageHeader.boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(toggleBox!.height).toBeGreaterThanOrEqual(24);
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(
      headerBox!.x + headerBox!.width + 2,
    );

    // Compact desktop viewport (1024x768): toggle stays contained within sticky column header
    await page.setViewportSize({ width: 1024, height: 768 });
    const compactToggleBox = await desktopToggle.boundingBox();
    const compactHeaderBox = await triageHeader.boundingBox();
    expect(compactToggleBox).not.toBeNull();
    expect(compactHeaderBox).not.toBeNull();
    expect(compactToggleBox!.height).toBeGreaterThanOrEqual(24);
    expect(compactToggleBox!.x + compactToggleBox!.width).toBeLessThanOrEqual(
      compactHeaderBox!.x + compactHeaderBox!.width + 2,
    );
    await page.setViewportSize({ width: 1440, height: 900 });

    // Also verify Desktop Cockpit VIP Triage Plate toggle exists
    await page.getByTestId("nav-cockpit-btn").click();
    const cockpitToggle = page.getByTestId(
      "cockpit-hide-repeating-triage-toggle",
    );
    await expect(cockpitToggle).toBeVisible();
    await expect(cockpitToggle).toHaveAttribute("aria-pressed", "false");

    // Mobile Triage Tab & Mobile Pods Tab
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    await page.getByTestId("mobile-tab-triage").click();
    await expect(page.getByTestId("mobile-triage-view")).toBeVisible();
    const mobileTriageToggle = page.getByTestId(
      "mobile-hide-repeating-triage-toggle",
    );
    await expect(mobileTriageToggle).toBeVisible();
    await expect(mobileTriageToggle).toHaveAttribute("aria-pressed", "false");
    const mobileTriageBox = await mobileTriageToggle.boundingBox();
    expect(mobileTriageBox).not.toBeNull();
    expect(mobileTriageBox!.height).toBeGreaterThanOrEqual(24);

    await page.getByTestId("mobile-tab-pods").click();
    await expect(page.getByTestId("mobile-pods-view")).toBeVisible();
    const mobilePodsToggle = page.getByTestId(
      "mobile-pods-hide-repeating-triage-toggle",
    );
    await expect(mobilePodsToggle).toBeVisible();
    await expect(mobilePodsToggle).toHaveAttribute("aria-pressed", "false");
    const mobilePodsBox = await mobilePodsToggle.boundingBox();
    expect(mobilePodsBox).not.toBeNull();
    expect(mobilePodsBox!.height).toBeGreaterThanOrEqual(24);
  });

  // [verifies: UI-011/AC-UI-011.2]
  test("hides recurring triage tasks across all projects and unassigned inbox while keeping non-repeating triage tasks", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    const alpha = await seedProject(request, `UI011 Alpha ${suffix}`);
    const beta = await seedProject(request, `UI011 Beta ${suffix}`);
    createdProjectIds.push(alpha.id, beta.id);

    const unassignedRepeat = await seedTask(request, {
      title: `UI011 Unassigned Repeat ${suffix}`,
      status: "triage",
      project_id: null,
      repeat_rule: "weekly",
    });
    const unassignedNormal = await seedTask(request, {
      title: `UI011 Unassigned Normal ${suffix}`,
      status: "triage",
      project_id: null,
      repeat_rule: "none",
    });
    const alphaRepeat = await seedTask(request, {
      title: `UI011 Alpha Repeat ${suffix}`,
      status: "triage",
      project_id: alpha.id,
      repeat_rule: "monthly",
    });
    const alphaNormal = await seedTask(request, {
      title: `UI011 Alpha Normal ${suffix}`,
      status: "triage",
      project_id: alpha.id,
      repeat_rule: "none",
    });
    const betaRepeat = await seedTask(request, {
      title: `UI011 Beta Repeat ${suffix}`,
      status: "triage",
      project_id: beta.id,
      repeat_rule: "yearly",
    });
    const betaNormal = await seedTask(request, {
      title: `UI011 Beta Normal ${suffix}`,
      status: "triage",
      project_id: beta.id,
      repeat_rule: "none",
    });
    const vipUnassignedRepeat = await seedTask(request, {
      title: `UI011 VIP Repeat ${suffix}`,
      status: "triage",
      project_id: null,
      repeat_rule: "weekly",
      created_by: "Boss [VIP]",
    });

    createdTaskIds.push(
      unassignedRepeat.id,
      unassignedNormal.id,
      alphaRepeat.id,
      alphaNormal.id,
      betaRepeat.id,
      betaNormal.id,
      vipUnassignedRepeat.id,
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-board-btn").click();

    const unassignedPod = page.getByTestId("swimlane-pod-unassigned");
    const alphaPod = page.getByTestId(`swimlane-pod-${alpha.id}`);
    const betaPod = page.getByTestId(`swimlane-pod-${beta.id}`);

    // All seeded triage items start visible
    await expect(
      unassignedPod.getByText(unassignedRepeat.title),
    ).toBeVisible();
    await expect(
      unassignedPod.getByText(unassignedNormal.title),
    ).toBeVisible();
    await expect(
      unassignedPod.getByText(vipUnassignedRepeat.title),
    ).toBeVisible();
    await expect(alphaPod.getByText(alphaRepeat.title)).toBeVisible();
    await expect(alphaPod.getByText(alphaNormal.title)).toBeVisible();
    await expect(betaPod.getByText(betaRepeat.title)).toBeVisible();
    await expect(betaPod.getByText(betaNormal.title)).toBeVisible();

    const desktopToggle = page.getByTestId("hide-repeating-triage-toggle");
    await desktopToggle.click();
    await expect(desktopToggle).toHaveAttribute("aria-pressed", "true");

    // Repeating triage tasks across all projects + unassigned inbox must be hidden
    await expect(unassignedPod.getByText(unassignedRepeat.title)).toHaveCount(
      0,
    );
    await expect(
      unassignedPod.getByText(vipUnassignedRepeat.title),
    ).toHaveCount(0);
    await expect(alphaPod.getByText(alphaRepeat.title)).toHaveCount(0);
    await expect(betaPod.getByText(betaRepeat.title)).toHaveCount(0);

    // Non-repeating triage tasks must remain visible across all pods
    await expect(
      unassignedPod.getByText(unassignedNormal.title),
    ).toBeVisible();
    await expect(alphaPod.getByText(alphaNormal.title)).toBeVisible();
    await expect(betaPod.getByText(betaNormal.title)).toBeVisible();

    // Hidden count badge matches API triage repeating count
    const apiRes = await request.get("/api/tasks");
    expect(apiRes.ok()).toBeTruthy();
    const apiTasks = (await apiRes.json()) as Array<{
      status: string;
      repeat_rule: string;
    }>;
    const expectedHiddenCount = apiTasks.filter(
      (t) => t.status === "triage" && t.repeat_rule !== "none",
    ).length;
    expect(expectedHiddenCount).toBeGreaterThanOrEqual(4);
    await expect(
      page.getByTestId("hidden-repeating-triage-count"),
    ).toHaveText(String(expectedHiddenCount));

    // Also verify Desktop Cockpit VIP Triage Queue respects the toggle
    await page.getByTestId("nav-cockpit-btn").click();
    const vipPlate = page.getByTestId("cockpit-vip-triage-plate");
    await expect(
      page.getByTestId("cockpit-hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(vipPlate.getByText(vipUnassignedRepeat.title)).toHaveCount(0);

    // Also verify Mobile Triage & Mobile Pods tabs respect the same toggle
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("mobile-tab-triage").click();
    const mobileTriageView = page.getByTestId("mobile-triage-view");
    await expect(
      page.getByTestId("mobile-hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(mobileTriageView.getByText(unassignedRepeat.title)).toHaveCount(
      0,
    );
    await expect(mobileTriageView.getByText(alphaRepeat.title)).toHaveCount(0);
    await expect(mobileTriageView.getByText(betaRepeat.title)).toHaveCount(0);
    await expect(
      mobileTriageView.getByText(unassignedNormal.title),
    ).toBeVisible();

    await page.getByTestId("mobile-tab-pods").click();
    const mobilePodsView = page.getByTestId("mobile-pods-view");
    await expect(
      page.getByTestId("mobile-pods-hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(mobilePodsView.getByText(alphaRepeat.title)).toHaveCount(0);
    await expect(mobilePodsView.getByText(betaRepeat.title)).toHaveCount(0);
    await expect(mobilePodsView.getByText(alphaNormal.title)).toBeVisible();
    await expect(mobilePodsView.getByText(betaNormal.title)).toBeVisible();
  });

  // [verifies: UI-011/AC-UI-011.3]
  test("keeps recurring tasks in todo, In Progress tiers, tracking, and Calendar view visible while toggle is enabled", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    const proj = await seedProject(request, `UI011 Columns ${suffix}`);
    createdProjectIds.push(proj.id);

    const safeCalendarDate = getSafeNonCurrentWeekSameMonthDateStr();

    const triageScheduledRepeat = await seedTask(request, {
      title: `UI011 Triage Calendar Repeat ${suffix}`,
      status: "triage",
      project_id: proj.id,
      repeat_rule: "weekly",
      action_date: safeCalendarDate,
    });
    const todoRepeat = await seedTask(request, {
      title: `UI011 Todo Repeat ${suffix}`,
      status: "todo",
      project_id: proj.id,
      repeat_rule: "weekly",
    });
    const todayRepeat = await seedTask(request, {
      title: `UI011 Today Repeat ${suffix}`,
      status: "in_progress_today",
      project_id: proj.id,
      repeat_rule: "weekly",
    });
    const weekRepeat = await seedTask(request, {
      title: `UI011 Week Repeat ${suffix}`,
      status: "in_progress_week",
      project_id: proj.id,
      repeat_rule: "monthly",
    });
    const monthRepeat = await seedTask(request, {
      title: `UI011 Month Repeat ${suffix}`,
      status: "in_progress_month",
      project_id: proj.id,
      repeat_rule: "yearly",
    });
    const trackingRepeat = await seedTask(request, {
      title: `UI011 Tracking Repeat ${suffix}`,
      status: "tracking",
      project_id: proj.id,
      repeat_rule: "monthly",
    });

    createdTaskIds.push(
      triageScheduledRepeat.id,
      todoRepeat.id,
      todayRepeat.id,
      weekRepeat.id,
      monthRepeat.id,
      trackingRepeat.id,
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-board-btn").click();

    await page.getByTestId("hide-repeating-triage-toggle").click();
    await expect(
      page.getByTestId("hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "true");

    const pod = page.getByTestId(`swimlane-pod-${proj.id}`);
    // Repeating triage task is hidden on the board
    await expect(pod.getByText(triageScheduledRepeat.title)).toHaveCount(0);

    // Repeating tasks in todo, In Progress tiers, and tracking remain visible
    await expect(pod.getByText(todoRepeat.title)).toBeVisible();
    await expect(pod.getByText(todayRepeat.title)).toBeVisible();
    await expect(pod.getByText(weekRepeat.title)).toBeVisible();
    await expect(pod.getByText(monthRepeat.title)).toBeVisible();
    await expect(pod.getByText(trackingRepeat.title)).toBeVisible();

    // Switch to Calendar view: repeating triage task badge remains visible & clickable
    await page.getByTestId("nav-calendar-btn").click();
    const calendarView = page.getByTestId("calendar-view");
    await expect(calendarView).toBeVisible();

    const calBadge = calendarView
      .getByTestId("badge-action-date")
      .filter({ hasText: triageScheduledRepeat.title })
      .first();
    await expect(calBadge).toBeVisible();
    await calBadge.click();
    await expect(page.getByTestId("task-modal")).toBeVisible();
    await page.getByTestId("close-task-modal-btn").click();
  });

  // [verifies: UI-011/AC-UI-011.4]
  test("persists repeating triage toggle preference across page reloads and immediately restores hidden items when disabled", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    const proj = await seedProject(request, `UI011 Persist ${suffix}`);
    createdProjectIds.push(proj.id);

    const repeatTriage = await seedTask(request, {
      title: `UI011 Persisted Repeat ${suffix}`,
      status: "triage",
      project_id: proj.id,
      repeat_rule: "weekly",
    });
    createdTaskIds.push(repeatTriage.id);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByTestId("nav-board-btn").click();

    const pod = page.getByTestId(`swimlane-pod-${proj.id}`);
    const toggle = page.getByTestId("hide-repeating-triage-toggle");

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(pod.getByText(repeatTriage.title)).toBeVisible();

    // Enable toggle and verify persistence across reload
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(pod.getByText(repeatTriage.title)).toHaveCount(0);

    const storedEnabled = await page.evaluate(() =>
      window.localStorage.getItem("kaj_hide_repeating_triage"),
    );
    expect(storedEnabled).toBe("true");

    await page.reload();
    await page.getByTestId("nav-board-btn").click();

    await expect(
      page.getByTestId("hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByTestId(`swimlane-pod-${proj.id}`).getByText(repeatTriage.title),
    ).toHaveCount(0);

    // Disable toggle -> immediately restores hidden recurring triage item and persists across reload
    await page.getByTestId("hide-repeating-triage-toggle").click();
    await expect(
      page.getByTestId("hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByTestId(`swimlane-pod-${proj.id}`).getByText(repeatTriage.title),
    ).toBeVisible();

    const storedDisabled = await page.evaluate(() =>
      window.localStorage.getItem("kaj_hide_repeating_triage"),
    );
    expect(storedDisabled).toBe("false");

    await page.reload();
    await page.getByTestId("nav-board-btn").click();
    await expect(
      page.getByTestId("hide-repeating-triage-toggle"),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByTestId(`swimlane-pod-${proj.id}`).getByText(repeatTriage.title),
    ).toBeVisible();
  });
});
