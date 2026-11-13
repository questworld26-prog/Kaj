#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase, initSchema, loadEnvFromRoot } from "../server/db.js";
import { EventBus } from "../server/events.js";
import { createMcpServer } from "./server.js";

// [spec: MCP-002]
// [spec: BACKUP-002]
async function main() {
  loadEnvFromRoot();
  const db = createDatabase(process.env.KAJ_DB_PATH);
  initSchema(db);
  const eventBus = new EventBus();

  const server = createMcpServer({ db, eventBus });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Kaj (কাজ) MCP stdio server started.");
}

main().catch((err) => {
  console.error("Fatal error in Kaj MCP stdio server:", err);
  process.exit(1);
});
