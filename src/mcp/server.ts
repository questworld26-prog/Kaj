import { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TaskRepository, ProjectRepository } from "../server/repository.js";
import { EventBus } from "../server/events.js";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  REPEAT_RULES,
  DateStringSchema,
  RepeatDayOfWeekSchema,
  RepeatDayOfMonthSchema,
  RepeatDayOfYearSchema,
} from "../shared/types.js";

export interface McpServerOptions {
  db: DatabaseSync;
  eventBus: EventBus;
}

// [spec: MCP-001]
// [spec: MCP-002]
// [spec: MCP-003]
export function createMcpServer(options: McpServerOptions): McpServer {
  const { db, eventBus } = options;
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);

  const server = new McpServer(
    {
      name: "kaj",
      version: "0.1.0",
    },
    {
      instructions:
        "Kaj (কাজ) task management server. Supports 6 Kanban columns (triage, todo, in_progress_today, in_progress_week, in_progress_month, tracking) and project swimlanes.",
    },
  );

  // 1. query_tasks
  server.registerTool(
    "query_tasks",
    {
      description:
        "Query and filter tasks by status, project, priority, dates, and keyword search across title, details, and waiting_on.",
      inputSchema: {
        status: z
          .array(z.enum(TASK_STATUSES))
          .optional()
          .describe("Filter by one or more statuses"),
        project_id: z
          .string()
          .nullable()
          .optional()
          .describe("Filter by project ID or null for unassigned"),
        priority: z
          .array(z.enum(TASK_PRIORITIES))
          .optional()
          .describe("Filter by priority horizons"),
        action_date_from: DateStringSchema.optional().describe(
          "Action date start YYYY-MM-DD",
        ),
        action_date_to: DateStringSchema.optional().describe(
          "Action date end YYYY-MM-DD",
        ),
        due_date_from: DateStringSchema.optional().describe(
          "Due date start YYYY-MM-DD",
        ),
        due_date_to: DateStringSchema.optional().describe(
          "Due date end YYYY-MM-DD",
        ),
        search: z.string().optional().describe("Keyword search term"),
        include_completed: z
          .boolean()
          .default(false)
          .describe("Whether to include completed tasks (default false)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max tasks to return"),
      },
      annotations: { readOnlyHint: true },
    },
    async (params) => {
      type SQLBinding = string | number | bigint | null | Uint8Array;
      let query = "SELECT * FROM tasks WHERE deleted_at IS NULL";
      const queryParams: SQLBinding[] = [];

      if (!params.include_completed) {
        query += " AND status != ?";
        queryParams.push("done");
      }

      if (params.status && params.status.length > 0) {
        query += ` AND status IN (${params.status.map(() => "?").join(",")})`;
        queryParams.push(...params.status);
      }

      if (params.project_id !== undefined) {
        if (params.project_id === null) {
          query += " AND project_id IS NULL";
        } else {
          query += " AND project_id = ?";
          queryParams.push(params.project_id);
        }
      }

      if (params.priority && params.priority.length > 0) {
        query += ` AND priority IN (${params.priority.map(() => "?").join(",")})`;
        queryParams.push(...params.priority);
      }

      if (params.action_date_from) {
        query += " AND action_date >= ?";
        queryParams.push(params.action_date_from);
      }
      if (params.action_date_to) {
        query += " AND action_date <= ?";
        queryParams.push(params.action_date_to);
      }

      if (params.due_date_from) {
        query += " AND due_date >= ?";
        queryParams.push(params.due_date_from);
      }
      if (params.due_date_to) {
        query += " AND due_date <= ?";
        queryParams.push(params.due_date_to);
      }

      if (params.search && params.search.trim()) {
        const pattern = `%${params.search.trim()}%`;
        query += " AND (title LIKE ? OR details LIKE ? OR waiting_on LIKE ?)";
        queryParams.push(pattern, pattern, pattern);
      }

      query += " ORDER BY sort_order ASC, created_at DESC LIMIT ?";
      queryParams.push(params.limit);

      const rows = db.prepare(query).all(...queryParams);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    },
  );

  // 2. get_task
  server.registerTool(
    "get_task",
    {
      description: "Retrieve full details of a single task by its unique ID.",
      inputSchema: { id: z.string().describe("The task ID, e.g. tsk_...") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const task = taskRepo.getTask(id);
      if (!task) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Task ${id} not found or has been soft-deleted.`,
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
      };
    },
  );

  // 3. get_board_summary
  server.registerTool(
    "get_board_summary",
    {
      description:
        "Get a compact summary of counts per swimlane and Kanban column, plus active tracking items.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const swimlanes = taskRepo.getBoardSwimlanes(projectRepo);
      const summary = swimlanes.map((lane) => {
        const counts: Record<string, number> = {};
        for (const col of TASK_STATUSES) {
          counts[col] = 0;
        }
        for (const t of lane.tasks) {
          counts[t.status] = (counts[t.status] || 0) + 1;
        }
        return {
          swimlane_id: lane.swimlane_id,
          project_name: lane.project ? lane.project.name : "Unassigned",
          total_tasks: lane.tasks.length,
          columns: counts,
        };
      });

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  // 4. create_task
  server.registerTool(
    "create_task",
    {
      description:
        "Create a new task with status, project, priority, action/due dates, repeat rules, and waiting-on notes.",
      inputSchema: {
        title: z.string().trim().min(1).describe("Required task title"),
        status: z
          .enum(TASK_STATUSES)
          .default("triage")
          .describe("Initial board status/column"),
        details: z
          .string()
          .default("")
          .describe("Optional markdown description or notes"),
        project_id: z
          .string()
          .nullable()
          .default(null)
          .describe("Project ID or null for Unassigned"),
        priority: z
          .enum(TASK_PRIORITIES)
          .default("week")
          .describe("Priority horizon (today, week, month, quarter, year)"),
        action_date: DateStringSchema.default(null).describe(
          "Optional action date YYYY-MM-DD",
        ),
        due_date: DateStringSchema.default(null).describe(
          "Optional deadline due date YYYY-MM-DD",
        ),
        repeat_rule: z
          .enum(REPEAT_RULES)
          .default("none")
          .describe("Recurrence rule (none, weekly, monthly, yearly)"),
        repeat_day_of_week: RepeatDayOfWeekSchema.default(null).describe(
          "Day of week (0=Sunday..6=Saturday) for weekly recurrence",
        ),
        repeat_day_of_month: RepeatDayOfMonthSchema.default(null).describe(
          "Day of month (1..31) for monthly recurrence",
        ),
        repeat_day_of_year: RepeatDayOfYearSchema.default(null).describe(
          "Month-day (MM-DD) for yearly recurrence",
        ),
        waiting_on: z
          .string()
          .default("")
          .describe(
            "Carrier tracking number or blocker description if status is tracking",
          ),
      },
      annotations: { destructiveHint: false },
    },
    async (input) => {
      const task = taskRepo.createTask(input);
      eventBus.broadcast({
        type: "task",
        action: "created",
        id: task.id,
        data: task,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
      };
    },
  );

  // 5. update_task
  server.registerTool(
    "update_task",
    {
      description:
        "Update one or more attributes of an existing task by its ID.",
      inputSchema: {
        id: z.string().describe("Task ID to update"),
        title: z.string().trim().min(1).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        details: z.string().optional(),
        project_id: z.string().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        action_date: DateStringSchema.optional(),
        due_date: DateStringSchema.optional(),
        repeat_rule: z.enum(REPEAT_RULES).optional(),
        repeat_day_of_week: RepeatDayOfWeekSchema.optional(),
        repeat_day_of_month: RepeatDayOfMonthSchema.optional(),
        repeat_day_of_year: RepeatDayOfYearSchema.optional(),
        waiting_on: z.string().optional(),
        sort_order: z.number().optional(),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...patch }) => {
      const updated = taskRepo.updateTask(id, patch);
      if (!updated) {
        return {
          isError: true,
          content: [{ type: "text", text: `Task ${id} not found.` }],
        };
      }
      eventBus.broadcast({
        type: "task",
        action: "updated",
        id: updated.id,
        data: updated,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // 6. move_task
  server.registerTool(
    "move_task",
    {
      description:
        "Move a task to a target column or project swimlane, optionally attaching a waiting-on note.",
      inputSchema: {
        id: z.string().describe("Task ID to move"),
        status: z
          .enum(TASK_STATUSES)
          .optional()
          .describe("Target column status"),
        project_id: z
          .string()
          .nullable()
          .optional()
          .describe("Target project ID or null for Unassigned"),
        waiting_on: z
          .string()
          .optional()
          .describe("Optional blocker or carrier tracking note"),
        sort_order: z.number().optional().describe("Target sort position"),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...patch }) => {
      const moved = taskRepo.updateTask(id, patch);
      if (!moved) {
        return {
          isError: true,
          content: [{ type: "text", text: `Task ${id} not found.` }],
        };
      }
      eventBus.broadcast({
        type: "task",
        action: "moved",
        id: moved.id,
        data: moved,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(moved, null, 2) }],
      };
    },
  );

  // 7. complete_task
  server.registerTool(
    "complete_task",
    {
      description:
        "Mark a task as done. If recurring (weekly, monthly, yearly), automatically spawns the next occurrence in triage.",
      inputSchema: {
        id: z.string().describe("Task ID to mark complete"),
      },
      annotations: { destructiveHint: false },
    },
    async ({ id }) => {
      try {
        const result = taskRepo.completeTask(id);
        eventBus.broadcast({
          type: "task",
          action: "completed",
          id,
          data: result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: (err as Error).message }],
        };
      }
    },
  );

  // 8. delete_task
  server.registerTool(
    "delete_task",
    {
      description:
        "Soft-delete a task by setting its deleted_at timestamp (preserving history, recoverable via restore_task).",
      inputSchema: {
        id: z.string().describe("Task ID to delete"),
        soft: z
          .boolean()
          .default(true)
          .describe("Whether to soft delete (default true)"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, soft }) => {
      const ok = taskRepo.deleteTask(id, soft);
      if (!ok) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Task ${id} not found or already deleted.` },
          ],
        };
      }
      eventBus.broadcast({ type: "task", action: "deleted", id });
      return {
        content: [{ type: "text", text: `Task ${id} deleted successfully.` }],
      };
    },
  );

  // 9. restore_task
  server.registerTool(
    "restore_task",
    {
      description: "Restore a soft-deleted task back to active status.",
      inputSchema: {
        id: z.string().describe("Task ID to restore"),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id }) => {
      const restored = taskRepo.restoreTask(id);
      if (!restored) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to restore task ${id}.` }],
        };
      }
      eventBus.broadcast({
        type: "task",
        action: "restored",
        id: restored.id,
        data: restored,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(restored, null, 2) }],
      };
    },
  );

  // 10. list_projects
  server.registerTool(
    "list_projects",
    {
      description:
        "List all project swimlanes with their colors, sort orders, and archive status.",
      inputSchema: {
        include_archived: z
          .boolean()
          .default(false)
          .describe("Include archived projects"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ include_archived }) => {
      const projects = projectRepo.listProjects(include_archived);
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    },
  );

  // 11. save_project
  server.registerTool(
    "save_project",
    {
      description: "Create or update a project swimlane.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("Project ID if updating existing project"),
        name: z.string().trim().min(1).describe("Project name"),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#10B981")
          .describe("Hex color code"),
        sort_order: z
          .number()
          .int()
          .optional()
          .describe("Swimlane vertical order index"),
        archived: z.boolean().optional().describe("Archive status"),
      },
      annotations: { idempotentHint: true },
    },
    async (input) => {
      if (input.id) {
        const updated = projectRepo.updateProject(input.id, {
          name: input.name,
          color: input.color,
          sort_order: input.sort_order,
          archived: input.archived,
        });
        eventBus.broadcast({
          type: "project",
          action: "updated",
          id: updated.id,
          data: updated,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
        };
      } else {
        const created = projectRepo.createProject({
          name: input.name,
          color: input.color,
          sort_order: input.sort_order,
        });
        eventBus.broadcast({
          type: "project",
          action: "created",
          id: created.id,
          data: created,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        };
      }
    },
  );

  return server;
}
