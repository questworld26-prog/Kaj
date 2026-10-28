import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase, initSchema } from '../../src/server/db.js';
import { EventBus } from '../../src/server/events.js';
import { createApp } from '../../src/server/app.js';

describe('Hono REST API & SSE Live Sync', () => {
  let db: DatabaseSync;
  let eventBus: EventBus;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    initSchema(db);
    eventBus = new EventBus();
    app = createApp({ db, eventBus });
  });

  it('GET /api/health returns 200 OK with server status and uptime', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('kaj');
  });

  it('manages projects via REST CRUD and reordering', async () => {
    // Create project
    const createRes = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Platform Engineering', color: '#10B981' }),
    });
    expect(createRes.status).toBe(201);
    const p1 = (await createRes.json()) as { id: string; name: string };
    expect(p1.name).toBe('Platform Engineering');

    // Create second project
    const createRes2 = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mobile Apps', color: '#38BDF8' }),
    });
    const p2 = (await createRes2.json()) as { id: string; name: string };

    // Reorder
    const reorderRes = await app.request('/api/projects/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_ids: [p2.id, p1.id] }),
    });
    expect(reorderRes.status).toBe(200);

    // List projects
    const listRes = await app.request('/api/projects');
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { id: string }[];
    expect(list[0].id).toBe(p2.id);
    expect(list[1].id).toBe(p1.id);
  });

  it('manages tasks via REST CRUD and board swimlanes', async () => {
    // Create task
    const createRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Build Hono API',
        status: 'todo',
        priority: 'week',
        action_date: '2026-10-28',
      }),
    });
    expect(createRes.status).toBe(201);
    const task = (await createRes.json()) as { id: string; title: string; status: string };
    expect(task.title).toBe('Build Hono API');

    // Update task
    const updateRes = await app.request(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress_today' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { status: string };
    expect(updated.status).toBe('in_progress_today');

    // Get board swimlanes
    const boardRes = await app.request('/api/board');
    expect(boardRes.status).toBe(200);
    const board = (await boardRes.json()) as { swimlane_id: string; tasks: { id: string }[] }[];
    expect(board.length).toBeGreaterThanOrEqual(1);
    expect(board[0].swimlane_id).toBe('unassigned');
    expect(board[0].tasks.some((t) => t.id === task.id)).toBe(true);

    // Complete task
    const compRes = await app.request(`/api/tasks/${task.id}/complete`, { method: 'POST' });
    expect(compRes.status).toBe(200);
    const compBody = (await compRes.json()) as { completed_task: { status: string } };
    expect(compBody.completed_task.status).toBe('done');

    // List completed
    const doneRes = await app.request('/api/completed');
    const doneList = (await doneRes.json()) as { id: string }[];
    expect(doneList.some((t) => t.id === task.id)).toBe(true);
  });
});
