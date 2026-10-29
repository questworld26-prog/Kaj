import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { EventBus } from "../../src/server/events.js";
import { createApp } from "../../src/server/app.js";

describe("Hono REST API & SSE Live Sync", () => {
  let db: DatabaseSync;
  let eventBus: EventBus;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    eventBus = new EventBus();
    app = createApp({ db, eventBus });
  });

  it("GET /api/health returns 200 OK with server status and uptime", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("kaj");
  });

  it("manages projects via REST CRUD and reordering", async () => {
    // Create project
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Platform Engineering", color: "#10B981" }),
    });
    expect(createRes.status).toBe(201);
    const p1 = (await createRes.json()) as { id: string; name: string };
    expect(p1.name).toBe("Platform Engineering");

    // Create second project
    const createRes2 = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Mobile Apps", color: "#38BDF8" }),
    });
    const p2 = (await createRes2.json()) as { id: string; name: string };

    // Reorder
    const reorderRes = await app.request("/api/projects/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_ids: [p2.id, p1.id] }),
    });
    expect(reorderRes.status).toBe(200);

    // List projects
    const listRes = await app.request("/api/projects");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { id: string }[];
    expect(list[0].id).toBe(p2.id);
    expect(list[1].id).toBe(p1.id);
  });

  it("manages tasks via REST CRUD and board swimlanes", async () => {
    // Create task
    const createRes = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Build Hono API",
        status: "todo",
        priority: "week",
        action_date: "2026-10-28",
      }),
    });
    expect(createRes.status).toBe(201);
    const task = (await createRes.json()) as {
      id: string;
      title: string;
      status: string;
    };
    expect(task.title).toBe("Build Hono API");

    // Update task
    const updateRes = await app.request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress_today" }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { status: string };
    expect(updated.status).toBe("in_progress_today");

    // Get board swimlanes
    const boardRes = await app.request("/api/board");
    expect(boardRes.status).toBe(200);
    const board = (await boardRes.json()) as {
      swimlane_id: string;
      tasks: { id: string }[];
    }[];
    expect(board.length).toBeGreaterThanOrEqual(1);
    expect(board[0].swimlane_id).toBe("unassigned");
    expect(board[0].tasks.some((t) => t.id === task.id)).toBe(true);

    // Complete task
    const compRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: "POST",
    });
    expect(compRes.status).toBe(200);
    const compBody = (await compRes.json()) as {
      completed_task: { status: string };
    };
    expect(compBody.completed_task.status).toBe("done");

    // List completed
    const doneRes = await app.request("/api/completed");
    const doneList = (await doneRes.json()) as { id: string }[];
    expect(doneList.some((t) => t.id === task.id)).toBe(true);
  });

  // [verifies: MCP-003/AC-MCP-003.4]
  it("rejects cross-origin requests to /api from unauthorized web origins", async () => {
    const evilRes = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://malicious.evil.com",
      },
      body: JSON.stringify({ title: "CSRF Task" }),
    });
    expect(evilRes.status).toBe(403);
  });

  // [verifies: TASK-002/AC-TASK-002.1]
  it("rejects mutating requests with body lacking application/json content-type", async () => {
    const textRes = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: JSON.stringify({ title: "Plain Text Task" }),
    });
    expect(textRes.status).toBe(415);
  });

  // [verifies: TASK-001/AC-TASK-001.4]
  it("returns 404 when reopening a non-existent task", async () => {
    const res = await app.request("/api/tasks/tsk_missing/reopen", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });

  // [verifies: PROJ-001/AC-PROJ-001.4]
  it("returns 400 when reordering with invalid or non-existent project IDs", async () => {
    const res = await app.request("/api/projects/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_ids: ["prj_invalid_1", "prj_invalid_2"] }),
    });
    expect(res.status).toBe(400);
  });

  // [verifies: MCP-002/AC-MCP-002.1]
  it("returns 404 JSON for unknown /api/* endpoints", async () => {
    const res = await app.request("/api/unknown/subpath");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Endpoint not found");
  });

  // [verifies: TASK-006/AC-TASK-006.1]
  it("reorders tasks via POST /api/tasks/reorder successfully", async () => {
    const c1 = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Task A", status: "todo" }),
    });
    const t1 = (await c1.json()) as { id: string };

    const c2 = await app.request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Task B", status: "todo" }),
    });
    const t2 = (await c2.json()) as { id: string };

    const reorderRes = await app.request("/api/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_ids: [t2.id, t1.id] }),
    });
    expect(reorderRes.status).toBe(200);
    const body = (await reorderRes.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const getT2 = await app.request(`/api/tasks/${t2.id}`);
    const updatedT2 = (await getT2.json()) as { sort_order: number };
    expect(updatedT2.sort_order).toBe(0);

    const getT1 = await app.request(`/api/tasks/${t1.id}`);
    const updatedT1 = (await getT1.json()) as { sort_order: number };
    expect(updatedT1.sort_order).toBe(1);
  });

  // [verifies: TASK-006/AC-TASK-006.3]
  it("rejects POST /api/tasks/reorder with 400 when task_ids is missing or invalid", async () => {
    const badRes1 = await app.request("/api/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_ids: "not-an-array" }),
    });
    expect(badRes1.status).toBe(400);

    const badRes2 = await app.request("/api/tasks/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_ids: ["tsk_does_not_exist"] }),
    });
    expect(badRes2.status).toBe(400);
  });
});
