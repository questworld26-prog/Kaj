import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase, initSchema } from '../../src/server/db.js';
import { TaskRepository, ProjectRepository } from '../../src/server/repository.js';

describe('Calendar Dual-Date Scheduling & Horizon Projections (TASK-005)', () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-005/AC-TASK-005.1]
  it('returns active tasks having action dates falling within week and month queried windows', () => {
    // Oct 28 falls within Week (Oct 26 - Nov 01) and Month (Oct 01 - Oct 31)
    const taskInWeek = taskRepo.createTask({
      title: 'Action Date in Week',
      action_date: '2026-10-28',
      due_date: '2026-11-15',
    });

    // Nov 10 is outside Week (Oct 26 - Nov 01) but inside Nov Month (Nov 01 - Nov 30)
    const taskInNov = taskRepo.createTask({
      title: 'Action Date in Nov Month',
      action_date: '2026-11-10',
    });

    // Week query
    const weekEvents = taskRepo.queryCalendarEvents('2026-10-26', '2026-11-01');
    const weekActionHits = weekEvents.filter((e) => e.date_type === 'action');
    expect(weekActionHits.some((e) => e.task_id === taskInWeek.id)).toBe(true);
    expect(weekActionHits.some((e) => e.task_id === taskInNov.id)).toBe(false);

    // Full October Month query
    const octEvents = taskRepo.queryCalendarEvents('2026-10-01', '2026-10-31');
    const octActionHits = octEvents.filter((e) => e.date_type === 'action');
    expect(octActionHits.some((e) => e.task_id === taskInWeek.id)).toBe(true);
    expect(octActionHits.some((e) => e.task_id === taskInNov.id)).toBe(false);
  });

  // [verifies: TASK-005/AC-TASK-005.2]
  it('returns active tasks having due dates falling within week and month queried windows', () => {
    const taskDue = taskRepo.createTask({
      title: 'Due on Oct 30',
      action_date: null,
      due_date: '2026-10-30',
    });

    const weekEvents = taskRepo.queryCalendarEvents('2026-10-26', '2026-11-01');
    const dueHits = weekEvents.filter((e) => e.date_type === 'due');
    expect(dueHits.some((e) => e.task_id === taskDue.id)).toBe(true);
    expect(dueHits.find((e) => e.task_id === taskDue.id)?.date).toBe('2026-10-30');
  });

  // [verifies: TASK-005/AC-TASK-005.3]
  it('lists active tasks lacking an action date in unscheduled tasks query for drag-to-schedule', () => {
    const unscheduled1 = taskRepo.createTask({ title: 'Unscheduled Task 1', action_date: null });
    const unscheduled2 = taskRepo.createTask({ title: 'Unscheduled Task 2', action_date: null, due_date: '2026-11-01' });
    const scheduled = taskRepo.createTask({ title: 'Scheduled Task', action_date: '2026-10-28' });

    const unscheduledList = taskRepo.listUnscheduledTasks();
    expect(unscheduledList.some((t) => t.id === unscheduled1.id)).toBe(true);
    expect(unscheduledList.some((t) => t.id === unscheduled2.id)).toBe(true);
    expect(unscheduledList.some((t) => t.id === scheduled.id)).toBe(false);

    // Test drag-to-schedule by setting action date
    const newlyScheduled = taskRepo.updateTask(unscheduled1.id, { action_date: '2026-10-29' });
    expect(newlyScheduled?.action_date).toBe('2026-10-29');
    expect(taskRepo.listUnscheduledTasks().some((t) => t.id === unscheduled1.id)).toBe(false);
  });

  // [verifies: TASK-005/AC-TASK-005.4]
  it('projects virtual recurrence instances within calendar window without creating database rows', () => {
    const initialCount = db.prepare('SELECT count(*) as count FROM tasks').get() as { count: number };

    // Active weekly task with action_date on Oct 28
    const weeklyTask = taskRepo.createTask({
      title: 'Weekly Team Sync',
      repeat_rule: 'weekly',
      action_date: '2026-10-28',
      status: 'todo',
    });

    // Query 4-week window: 2026-10-26 to 2026-11-22
    const events = taskRepo.queryCalendarEvents('2026-10-26', '2026-11-22');
    const taskEvents = events.filter((e) => e.task_id === weeklyTask.id);

    // Expected occurrences: Oct 28 (real), Nov 04 (virtual), Nov 11 (virtual), Nov 18 (virtual)
    const dates = taskEvents.map((e) => e.date).sort();
    expect(dates).toEqual(['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18']);

    const virtualOccurrences = taskEvents.filter((e) => e.is_virtual);
    expect(virtualOccurrences.length).toBe(3);

    // Verify DB count has not changed (zero ghost duplicate rows!)
    const currentCount = db.prepare('SELECT count(*) as count FROM tasks').get() as { count: number };
    expect(currentCount.count).toBe(initialCount.count + 1);
  });
});
