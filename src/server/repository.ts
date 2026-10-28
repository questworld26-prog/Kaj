import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  Project,
  CreateProjectInput,
  CreateProjectInputSchema,
  UpdateProjectInput,
  UpdateProjectInputSchema,
  Task,
  CreateTaskInput,
  CreateTaskInputSchema,
  UpdateTaskInput,
  UpdateTaskInputSchema,
  CalendarEvent,
  RepeatRule,
} from '../shared/types.js';

function generateId(prefix: 'prj' | 'tsk'): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export function shiftDate(dateStr: string, rule: RepeatRule): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (rule === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }
  if (rule === 'monthly') {
    let nextYear = y;
    let nextMonth = m + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const clampedDay = Math.min(d, daysInNextMonth);
    const mm = String(nextMonth).padStart(2, '0');
    const dd = String(clampedDay).padStart(2, '0');
    return `${nextYear}-${mm}-${dd}`;
  }
  if (rule === 'yearly') {
    const nextYear = y + 1;
    const daysInMonth = new Date(Date.UTC(nextYear, m, 0)).getUTCDate();
    const clampedDay = Math.min(d, daysInMonth);
    const mm = String(m).padStart(2, '0');
    const dd = String(clampedDay).padStart(2, '0');
    return `${nextYear}-${mm}-${dd}`;
  }
  return dateStr;
}

// [spec: PROJ-001]
export class ProjectRepository {
  constructor(private db: DatabaseSync) {}

  createProject(input: CreateProjectInput): Project {
    const validated = CreateProjectInputSchema.parse(input);
    const id = generateId('prj');
    const now = new Date().toISOString();

    let sortOrder = validated.sort_order;
    if (sortOrder === undefined) {
      const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM projects').get() as { next_order: number };
      sortOrder = row.next_order;
    }

    this.db
      .prepare(
        `INSERT INTO projects (id, name, color, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, validated.name, validated.color, sortOrder, now, now);

    return this.getProject(id)!;
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    return row || null;
  }

  listProjects(includeArchived = false): Project[] {
    const sql = includeArchived
      ? 'SELECT * FROM projects ORDER BY sort_order ASC, name ASC'
      : 'SELECT * FROM projects WHERE archived = 0 ORDER BY sort_order ASC, name ASC';
    return this.db.prepare(sql).all() as unknown as Project[];
  }

  updateProject(id: string, input: UpdateProjectInput): Project {
    const validated = UpdateProjectInputSchema.parse(input);
    const existing = this.getProject(id);
    if (!existing) {
      throw new Error(`Project ${id} not found`);
    }

    const name = validated.name !== undefined ? validated.name : existing.name;
    const color = validated.color !== undefined ? validated.color : existing.color;
    const sortOrder = validated.sort_order !== undefined ? validated.sort_order : existing.sort_order;
    const archived = validated.archived !== undefined ? (validated.archived ? 1 : 0) : existing.archived;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, color = ?, sort_order = ?, archived = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(name, color, sortOrder, archived, now, id);

    return this.getProject(id)!;
  }

  archiveProject(id: string, archived = true): Project {
    return this.updateProject(id, { archived });
  }

  reorderProjects(projectIds: string[]): void {
    const now = new Date().toISOString();
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare('UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?');
      for (let i = 0; i < projectIds.length; i++) {
        stmt.run(i, now, projectIds[i]);
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }
}

// [spec: TASK-001]
// [spec: TASK-002]
// [spec: TASK-003]
// [spec: TASK-004]
// [spec: TASK-005]
// [spec: PROJ-002]
export class TaskRepository {
  constructor(private db: DatabaseSync) {}

  createTask(input: CreateTaskInput): Task {
    const validated = CreateTaskInputSchema.parse(input);
    const id = generateId('tsk');
    const now = new Date().toISOString();

    let sortOrder = validated.sort_order;
    if (sortOrder === undefined) {
      const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1.0 AS next_order FROM tasks').get() as { next_order: number };
      sortOrder = row.next_order;
    }

    this.db
      .prepare(
        `INSERT INTO tasks (
          id, title, status, details, project_id, priority, action_date, due_date,
          repeat_rule, waiting_on, sort_order, completed_at, deleted_at,
          parent_recurring_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`
      )
      .run(
        id,
        validated.title,
        validated.status,
        validated.details,
        validated.project_id,
        validated.priority,
        validated.action_date,
        validated.due_date,
        validated.repeat_rule,
        validated.waiting_on,
        sortOrder,
        now,
        now
      );

    return this.getTask(id)!;
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as Task | undefined;
    return row || null;
  }

  updateTask(id: string, input: UpdateTaskInput): Task | null {
    const validated = UpdateTaskInputSchema.parse(input);
    const existing = this.getTask(id);
    if (!existing) {
      return null;
    }

    const title = validated.title !== undefined ? validated.title : existing.title;
    const status = validated.status !== undefined ? validated.status : existing.status;
    const details = validated.details !== undefined ? validated.details : existing.details;
    const projectId = validated.project_id !== undefined ? validated.project_id : existing.project_id;
    const priority = validated.priority !== undefined ? validated.priority : existing.priority;
    const actionDate = validated.action_date !== undefined ? validated.action_date : existing.action_date;
    const dueDate = validated.due_date !== undefined ? validated.due_date : existing.due_date;
    const repeatRule = validated.repeat_rule !== undefined ? validated.repeat_rule : existing.repeat_rule;
    const waitingOn = validated.waiting_on !== undefined ? validated.waiting_on : existing.waiting_on;
    const sortOrder = validated.sort_order !== undefined ? validated.sort_order : existing.sort_order;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE tasks
         SET title = ?, status = ?, details = ?, project_id = ?, priority = ?,
             action_date = ?, due_date = ?, repeat_rule = ?, waiting_on = ?,
             sort_order = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, status, details, projectId, priority, actionDate, dueDate, repeatRule, waitingOn, sortOrder, now, id);

    return this.getTask(id);
  }

  completeTask(id: string): { completed_task: Task; spawned_task: Task | null } {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run('done', now, now, id);

    const completedTask = this.getTask(id) || { ...task, status: 'done', completed_at: now, updated_at: now };

    let spawnedTask: Task | null = null;
    if (task.repeat_rule !== 'none') {
      const nextAction = task.action_date ? shiftDate(task.action_date, task.repeat_rule) : null;
      const nextDue = task.due_date ? shiftDate(task.due_date, task.repeat_rule) : null;
      const newId = generateId('tsk');

      const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1.0 AS next_order FROM tasks').get() as { next_order: number };

      this.db
        .prepare(
          `INSERT INTO tasks (
            id, title, status, details, project_id, priority, action_date, due_date,
            repeat_rule, waiting_on, sort_order, completed_at, deleted_at,
            parent_recurring_id, created_at, updated_at
          ) VALUES (?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`
        )
        .run(
          newId,
          task.title,
          task.details,
          task.project_id,
          task.priority,
          nextAction,
          nextDue,
          task.repeat_rule,
          task.waiting_on,
          row.next_order,
          task.id,
          now,
          now
        );

      spawnedTask = this.getTask(newId);
    }

    return { completed_task: completedTask, spawned_task: spawnedTask };
  }

  reopenTask(id: string): Task {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?')
      .run('todo', now, id);
    return this.getTask(id)!;
  }

  deleteTask(id: string, soft = true): boolean {
    if (soft) {
      const now = new Date().toISOString();
      const res = this.db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, now, id);
      return res.changes > 0;
    }
    const res = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return res.changes > 0;
  }

  restoreTask(id: string): Task | null {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    return this.getTask(id);
  }

  listCompletedTasks(): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY completed_at DESC')
      .all('done') as unknown as Task[];
  }

  listUnscheduledTasks(): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE action_date IS NULL AND status != ? AND deleted_at IS NULL ORDER BY sort_order ASC')
      .all('done') as unknown as Task[];
  }

  getBoardSwimlanes(projectRepo: ProjectRepository): { swimlane_id: string; project: Project | null; tasks: Task[] }[] {
    const activeTasks = this.db
      .prepare('SELECT * FROM tasks WHERE status != ? AND deleted_at IS NULL ORDER BY sort_order ASC')
      .all('done') as unknown as Task[];

    const projects = projectRepo.listProjects(false);

    const swimlanes: { swimlane_id: string; project: Project | null; tasks: Task[] }[] = [];

    // Top swimlane is always Unassigned
    const unassignedTasks = activeTasks.filter((t) => t.project_id === null);
    swimlanes.push({
      swimlane_id: 'unassigned',
      project: null,
      tasks: unassignedTasks,
    });

    for (const proj of projects) {
      const projTasks = activeTasks.filter((t) => t.project_id === proj.id);
      swimlanes.push({
        swimlane_id: proj.id,
        project: proj,
        tasks: projTasks,
      });
    }

    return swimlanes;
  }

  queryCalendarEvents(startDate: string, endDate: string): CalendarEvent[] {
    const activeTasks = this.db
      .prepare('SELECT * FROM tasks WHERE status != ? AND deleted_at IS NULL')
      .all('done') as unknown as Task[];

    const events: CalendarEvent[] = [];

    for (const task of activeTasks) {
      // 1. Action date events (real)
      if (task.action_date) {
        if (task.action_date >= startDate && task.action_date <= endDate) {
          events.push({
            task_id: task.id,
            title: task.title,
            status: task.status,
            project_id: task.project_id,
            priority: task.priority,
            date: task.action_date,
            date_type: 'action',
            is_virtual: false,
          });
        }

        // Virtual recurrence projections for action date
        if (task.repeat_rule !== 'none') {
          let curr = shiftDate(task.action_date, task.repeat_rule);
          while (curr <= endDate) {
            if (curr >= startDate) {
              events.push({
                task_id: task.id,
                title: task.title,
                status: task.status,
                project_id: task.project_id,
                priority: task.priority,
                date: curr,
                date_type: 'action',
                is_virtual: true,
              });
            }
            curr = shiftDate(curr, task.repeat_rule);
          }
        }
      }

      // 2. Due date events (real)
      if (task.due_date) {
        if (task.due_date >= startDate && task.due_date <= endDate) {
          events.push({
            task_id: task.id,
            title: task.title,
            status: task.status,
            project_id: task.project_id,
            priority: task.priority,
            date: task.due_date,
            date_type: 'due',
            is_virtual: false,
          });
        }
      }
    }

    return events;
  }
}

