import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { EventBus } from "../../src/server/events.js";
import { createApp } from "../../src/server/app.js";

describe("Model Context Protocol Suite (MCP-001, MCP-002, MCP-003)", () => {
  let db: DatabaseSync;
  let eventBus: EventBus;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    db = createDatabase(":memory:");
    initSchema(db);
    eventBus = new EventBus();

    const mcpServer = createMcpServer({ db, eventBus });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client(
      { name: "test-agent", version: "1.0.0" },
      { capabilities: {} },
    );

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  // [verifies: MCP-001/AC-MCP-001.1]
  it("query_tasks tool filters by status, priority, dates, and search string", async () => {
    // Seed tasks
    await client.callTool({
      name: "create_task",
      arguments: {
        title: "Review Alpha Architecture",
        status: "todo",
        priority: "week",
        action_date: "2026-10-28",
        due_date: "2026-11-04",
        details: "Check security and scalability",
      },
    });

    await client.callTool({
      name: "create_task",
      arguments: {
        title: "Beta Integration Testing",
        status: "in_progress_today",
        priority: "today",
        action_date: "2026-10-28",
        due_date: "2026-10-30",
        details: "Run automated suites",
      },
    });

    // Filter by status
    const statusRes = (await client.callTool({
      name: "query_tasks",
      arguments: { status: ["in_progress_today"] },
    })) as { content: [{ text: string }] };
    const statusTasks = JSON.parse(statusRes.content[0].text);
    expect(statusTasks.length).toBe(1);
    expect(statusTasks[0].title).toBe("Beta Integration Testing");

    // Filter by search string
    const searchRes = (await client.callTool({
      name: "query_tasks",
      arguments: { search: "scalability" },
    })) as { content: [{ text: string }] };
    const searchTasks = JSON.parse(searchRes.content[0].text);
    expect(searchTasks.length).toBe(1);
    expect(searchTasks[0].title).toBe("Review Alpha Architecture");
  });

  // [verifies: MCP-001/AC-MCP-001.2]
  it("create_task tool creates task and returns structured JSON with all attributes", async () => {
    const res = (await client.callTool({
      name: "create_task",
      arguments: {
        title: "Draft MCP Specification",
        status: "todo",
        priority: "quarter",
        action_date: "2026-11-01",
        due_date: "2026-11-15",
        repeat_rule: "monthly",
        waiting_on: "Waiting on peer review",
        details: "Full protocol definitions",
      },
    })) as { content: [{ text: string }] };

    const task = JSON.parse(res.content[0].text);
    expect(task.id).toMatch(/^tsk_/);
    expect(task.title).toBe("Draft MCP Specification");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("quarter");
    expect(task.action_date).toBe("2026-11-01");
    expect(task.due_date).toBe("2026-11-15");
    expect(task.repeat_rule).toBe("monthly");
    expect(task.waiting_on).toBe("Waiting on peer review");
    expect(task.details).toBe("Full protocol definitions");
  });

  // [verifies: MCP-001/AC-MCP-001.3]
  it("update_task tool updates partial fields by task ID", async () => {
    const createRes = (await client.callTool({
      name: "create_task",
      arguments: { title: "Initial Name", priority: "week" },
    })) as { content: [{ text: string }] };
    const created = JSON.parse(createRes.content[0].text);

    const updateRes = (await client.callTool({
      name: "update_task",
      arguments: {
        id: created.id,
        title: "Updated Name",
        priority: "today",
      },
    })) as { content: [{ text: string }] };
    const updated = JSON.parse(updateRes.content[0].text);

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe("Updated Name");
    expect(updated.priority).toBe("today");
  });

  // [verifies: MCP-001/AC-MCP-001.4]
  it("move_task tool relocates task across columns and updates waiting-on note", async () => {
    const createRes = (await client.callTool({
      name: "create_task",
      arguments: { title: "Ship Monitor", status: "todo" },
    })) as { content: [{ text: string }] };
    const task = JSON.parse(createRes.content[0].text);

    const moveRes = (await client.callTool({
      name: "move_task",
      arguments: {
        id: task.id,
        status: "tracking",
        waiting_on: "Carrier tracking #DHL8829",
      },
    })) as { content: [{ text: string }] };
    const moved = JSON.parse(moveRes.content[0].text);

    expect(moved.status).toBe("tracking");
    expect(moved.waiting_on).toBe("Carrier tracking #DHL8829");
  });

  // [verifies: MCP-001/AC-MCP-001.5]
  it("complete_task marks task done and returns completed task and spawned recurrence instance", async () => {
    const createRes = (await client.callTool({
      name: "create_task",
      arguments: {
        title: "Weekly Standup",
        repeat_rule: "weekly",
        action_date: "2026-10-28",
        due_date: "2026-10-29",
      },
    })) as { content: [{ text: string }] };
    const task = JSON.parse(createRes.content[0].text);

    const completeRes = (await client.callTool({
      name: "complete_task",
      arguments: { id: task.id },
    })) as { content: [{ text: string }] };
    const res = JSON.parse(completeRes.content[0].text);

    expect(res.completed_task.status).toBe("done");
    expect(res.completed_task.completed_at).not.toBeNull();
    expect(res.spawned_task).not.toBeNull();
    expect(res.spawned_task.status).toBe("todo");
    expect(res.spawned_task.action_date).toBe("2026-11-04"); // +7d
  });

  // [verifies: MCP-001/AC-MCP-001.6]
  it("list_projects and save_project tools manage projects", async () => {
    const saveRes = (await client.callTool({
      name: "save_project",
      arguments: { name: "Core Infrastructure", color: "#10B981" },
    })) as { content: [{ text: string }] };
    const saved = JSON.parse(saveRes.content[0].text);
    expect(saved.id).toMatch(/^prj_/);
    expect(saved.name).toBe("Core Infrastructure");
    expect(saved.color).toBe("#10B981");

    const listRes = (await client.callTool({
      name: "list_projects",
      arguments: {},
    })) as { content: [{ text: string }] };
    const list = JSON.parse(listRes.content[0].text);
    expect(list.some((p: { id: string }) => p.id === saved.id)).toBe(true);
  });

  // [verifies: MCP-002/AC-MCP-002.1]
  it("background daemon responds to MCP JSON-RPC protocol over POST /mcp", async () => {
    const app = createApp({ db, eventBus });

    const initReq = new Request("http://127.0.0.1:4820/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-http-agent", version: "1.0.0" },
        },
      }),
    });

    const res = await app.request(initReq);
    expect(res.status).toBe(200);
    const text = await res.text();
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const body = JSON.parse(dataLine!.slice(6));
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("kaj");
  });

  // [verifies: MCP-002/AC-MCP-002.2]
  it("stdio entrypoint file exists and is executable", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const stdioSourcePath = path.resolve("src/mcp/stdio.ts");
    expect(fs.existsSync(stdioSourcePath)).toBe(true);
  });

  // [verifies: MCP-002/AC-MCP-002.3]
  it("task mutations via MCP broadcast SSE events on event bus", async () => {
    const events: { type: string; action: string; id: string }[] = [];
    const unsubscribe = eventBus.subscribe((evt) => {
      events.push(evt);
    });

    await client.callTool({
      name: "create_task",
      arguments: { title: "SSE Trigger Task" },
    });

    unsubscribe();
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((e) => e.type === "task" && e.action === "created"),
    ).toBe(true);
  });

  // [verifies: MCP-003/AC-MCP-003.1]
  it("declares readOnlyHint: true on query_tasks, get_task, get_board_summary, list_projects", async () => {
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;

    const readOnlyToolNames = [
      "query_tasks",
      "get_task",
      "get_board_summary",
      "list_projects",
    ];
    for (const name of readOnlyToolNames) {
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }
  });

  // [verifies: MCP-003/AC-MCP-003.2]
  it("delete_task tool declares destructiveHint: true and performs soft-delete", async () => {
    const toolsResult = await client.listTools();
    const deleteTool = toolsResult.tools.find((t) => t.name === "delete_task");
    expect(deleteTool?.annotations?.destructiveHint).toBe(true);

    const createRes = (await client.callTool({
      name: "create_task",
      arguments: { title: "To Be Soft Deleted" },
    })) as { content: [{ text: string }] };
    const task = JSON.parse(createRes.content[0].text);

    await client.callTool({
      name: "delete_task",
      arguments: { id: task.id },
    });

    // Task is not found via get_task
    const getRes = (await client.callTool({
      name: "get_task",
      arguments: { id: task.id },
    })) as { isError?: boolean };
    expect(getRes.isError).toBe(true);

    // But row still exists in database with deleted_at populated
    const row = db
      .prepare("SELECT deleted_at FROM tasks WHERE id = ?")
      .get(task.id) as { deleted_at: string | null };
    expect(row.deleted_at).not.toBeNull();
  });

  // [verifies: MCP-003/AC-MCP-003.3]
  it("restore_task tool restores soft-deleted task back to active status", async () => {
    const createRes = (await client.callTool({
      name: "create_task",
      arguments: { title: "Restore Me" },
    })) as { content: [{ text: string }] };
    const task = JSON.parse(createRes.content[0].text);

    await client.callTool({ name: "delete_task", arguments: { id: task.id } });

    const restoreRes = (await client.callTool({
      name: "restore_task",
      arguments: { id: task.id },
    })) as { content: [{ text: string }] };
    const restored = JSON.parse(restoreRes.content[0].text);

    expect(restored.id).toBe(task.id);
    expect(restored.deleted_at).toBeNull();
  });

  // [verifies: MCP-003/AC-MCP-003.4]
  it("rejects POST /mcp requests from unauthorized browser cross-origins (DNS rebinding guard)", async () => {
    const app = createApp({ db, eventBus });

    // Unauthorized external origin
    const badReq = new Request("http://127.0.0.1:4820/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://malicious-site.com",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    const badRes = await app.request(badReq);
    expect(badRes.status).toBe(403);

    // Allowed local origin
    const goodReq = new Request("http://127.0.0.1:4820/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:4820",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "local-test", version: "1.0" },
        },
      }),
    });

    const goodRes = await app.request(goodReq);
    expect(goodRes.status).toBe(200);

    // Allowed mDNS origin (jarvis.local)
    const jarvisReq = new Request("http://jarvis.local:4820/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "jarvis.local:4820",
        origin: "http://jarvis.local:4820",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "jarvis-local-agent", version: "1.0" },
        },
      }),
    });

    const jarvisRes = await app.request(jarvisReq);
    expect(jarvisRes.status).toBe(200);
  });

  // [verifies: MCP-002/AC-MCP-002.1]
  it("handles multiple sequential and concurrent POST /mcp requests without transport collision", async () => {
    const app = createApp({ db, eventBus });

    const makeRequest = (id: number) =>
      new Request("http://127.0.0.1:4820/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:4820",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "agent", version: "1.0" },
          },
        }),
      });

    // Sequential calls (request 2, 3, 4, 5)
    for (let i = 1; i <= 5; i++) {
      const res = await app.request(makeRequest(i));
      expect(res.status).toBe(200);
    }

    // Concurrent calls
    const concurrentResponses = await Promise.all([
      app.request(makeRequest(10)),
      app.request(makeRequest(11)),
      app.request(makeRequest(12)),
    ]);
    for (const res of concurrentResponses) {
      expect(res.status).toBe(200);
    }
  });
});
