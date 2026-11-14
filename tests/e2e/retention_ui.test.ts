// [spec: UI-013]
import { test, expect } from "@playwright/test";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { EventBus } from "../../src/server/events.js";
import { ProjectRepository, TaskRepository } from "../../src/server/repository.js";
import { createApp } from "../../src/server/app.js";

async function startIsolatedServer() {
  const db = createDatabase(":memory:");
  initSchema(db);
  const eventBus = new EventBus();
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);
  const app = createApp({ db, eventBus });

  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  });

  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.once("listening", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    db,
    taskRepo,
    projectRepo,
    baseUrl,
    close: async () => {
      if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

test.describe("Kaj (কাজ) Completed Retention & Telemetry Snapshot UI (UI-013)", () => {
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

  // [verifies: UI-013/AC-UI-013.1]
  test("combines live completed tasks with telemetry snapshots across Desktop Cockpit charts", async ({
    page,
  }) => {
    const ctx = await startIsolatedServer();
    try {
      const proj = ctx.projectRepo.createProject({ name: "TelemetryProj", color: "#10B981" });

      // Seed 2 expired done tasks (100 days old) and purge with 90-day retention to create snapshots
      const oldIso = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const tOld1 = ctx.taskRepo.createTask({
        title: "Old purged task 1",
        status: "todo",
        project_id: proj.id,
        created_by: "Alice",
      });
      const tOld2 = ctx.taskRepo.createTask({
        title: "Old purged task 2",
        status: "todo",
        project_id: proj.id,
        created_by: "Alice",
      });
      ctx.taskRepo.completeTask(tOld1.id);
      ctx.taskRepo.completeTask(tOld2.id);
      ctx.db.prepare("UPDATE tasks SET completed_at = ? WHERE id IN (?, ?)").run(
        oldIso,
        tOld1.id,
        tOld2.id,
      );
      const purged = ctx.taskRepo.purgeExpiredDoneTasks(90);
      expect(purged.purged_count).toBe(2);

      // Seed 1 recent done task (today)
      const tRecent = ctx.taskRepo.createTask({
        title: "Recent live task",
        status: "todo",
        project_id: proj.id,
        created_by: "Bob",
      });
      ctx.taskRepo.completeTask(tRecent.id);

      await page.goto(ctx.baseUrl);
      await page.getByTestId("nav-cockpit-btn").click();

      const velocityChart = page.getByTestId("cockpit-weekly-velocity-chart");
      const projectChart = page.getByTestId("cockpit-project-distribution-chart");
      const creatorChart = page.getByTestId("cockpit-creator-stacked-chart");

      await expect(velocityChart).toContainText("Total: 3 done");
      await expect(projectChart).toContainText("3 Total Done");
      await expect(projectChart).toContainText("TelemetryProj");
      await expect(creatorChart).toBeVisible();
    } finally {
      await page.goto("about:blank");
      await ctx.close();
    }
  });

  // [verifies: UI-013/AC-UI-013.2]
  test("displays 90-day retention notice and manual purge trigger inside Completed Archive drawer", async ({
    page,
  }) => {
    const ctx = await startIsolatedServer();
    try {
      await page.goto(ctx.baseUrl);
      await page.getByTestId("open-archive-btn").click();

      const drawer = page.getByTestId("completed-archive-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toContainText("90 days");

      const purgeBtn = page.getByTestId("purge-expired-btn");
      await expect(purgeBtn).toBeVisible();
    } finally {
      await page.goto("about:blank");
      await ctx.close();
    }
  });

  // [verifies: UI-013/AC-UI-013.3]
  test("refreshes Completed Archive and Cockpit telemetry immediately when manual retention purge completes", async ({
    page,
  }) => {
    const ctx = await startIsolatedServer();
    try {
      const oldIso = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const tExpired = ctx.taskRepo.createTask({
        title: "Expired Done For Manual Purge",
        status: "todo",
        created_by: "Alice",
      });
      ctx.taskRepo.completeTask(tExpired.id);
      ctx.db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(oldIso, tExpired.id);

      const tRecent = ctx.taskRepo.createTask({
        title: "Recent Done Kept",
        status: "todo",
        created_by: "Bob",
      });
      ctx.taskRepo.completeTask(tRecent.id);

      await page.goto(ctx.baseUrl);
      await page.getByTestId("open-archive-btn").click();

      const drawer = page.getByTestId("completed-archive-drawer");
      await expect(drawer).toContainText("Expired Done For Manual Purge");
      await expect(drawer).toContainText("Recent Done Kept");

      await page.getByTestId("purge-expired-btn").click();

      await expect(drawer).not.toContainText("Expired Done For Manual Purge");
      await expect(drawer).toContainText("Recent Done Kept");
      await expect(page.getByTestId("purge-status-msg")).toContainText("Purged 1");

      await page.getByTestId("close-archive-btn").click();
      await page.getByTestId("nav-cockpit-btn").click();
      await expect(page.getByTestId("cockpit-project-distribution-chart")).toContainText("2 Total Done");
    } finally {
      await page.goto("about:blank");
      await ctx.close();
    }
  });
});
