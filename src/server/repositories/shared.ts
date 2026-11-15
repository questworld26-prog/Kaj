// [spec: PROJ-001]
// [spec: TASK-002]
import crypto from "node:crypto";

export function generateId(prefix: "prj" | "tsk"): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}
