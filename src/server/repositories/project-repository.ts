// [spec: PROJ-001]
import { DatabaseSync } from "node:sqlite";
import {
  Project,
  CreateProjectInput,
  CreateProjectInputSchema,
  UpdateProjectInput,
  UpdateProjectInputSchema,
} from "../../shared/types.js";
import { generateId } from "./shared.js";

// [spec: PROJ-001]
export class ProjectRepository {
  constructor(private db: DatabaseSync) {}

  createProject(input: CreateProjectInput): Project {
    const validated = CreateProjectInputSchema.parse(input);
    const id = generateId("prj");
    const now = new Date().toISOString();

    let sortOrder = validated.sort_order;
    if (sortOrder === undefined) {
      const row = this.db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM projects",
        )
        .get() as { next_order: number };
      sortOrder = row.next_order;
    }

    this.db
      .prepare(
        `INSERT INTO projects (id, name, color, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, validated.name, validated.color, sortOrder, now, now);

    return this.getProject(id)!;
  }

  getProject(id: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as Project | undefined;
    return row || null;
  }

  listProjects(includeArchived = false): Project[] {
    const sql = includeArchived
      ? "SELECT * FROM projects ORDER BY sort_order ASC, name ASC"
      : "SELECT * FROM projects WHERE archived = 0 ORDER BY sort_order ASC, name ASC";
    return this.db.prepare(sql).all() as unknown as Project[];
  }

  updateProject(id: string, input: UpdateProjectInput): Project {
    const validated = UpdateProjectInputSchema.parse(input);
    const existing = this.getProject(id);
    if (!existing) {
      throw new Error(`Project ${id} not found`);
    }

    const name = validated.name !== undefined ? validated.name : existing.name;
    const color =
      validated.color !== undefined ? validated.color : existing.color;
    const sortOrder =
      validated.sort_order !== undefined
        ? validated.sort_order
        : existing.sort_order;
    const archived =
      validated.archived !== undefined
        ? validated.archived
          ? 1
          : 0
        : existing.archived;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, color = ?, sort_order = ?, archived = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(name, color, sortOrder, archived, now, id);

    return this.getProject(id)!;
  }

  archiveProject(id: string, archived = true): Project {
    return this.updateProject(id, { archived });
  }

  reorderProjects(projectIds: string[]): void {
    if (projectIds.length === 0) return;
    const placeholders = projectIds.map(() => "?").join(",");
    const existingRows = this.db
      .prepare(`SELECT id FROM projects WHERE id IN (${placeholders})`)
      .all(...projectIds) as { id: string }[];
    if (existingRows.length !== projectIds.length) {
      throw new Error("One or more project IDs are invalid");
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const stmt = this.db.prepare(
        "UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?",
      );
      for (let i = 0; i < projectIds.length; i++) {
        stmt.run(i, now, projectIds[i]);
      }
      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }
}
