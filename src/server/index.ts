import { serve } from '@hono/node-server';
import { createDatabase, initSchema } from './db.js';
import { EventBus } from './events.js';
import { createApp } from './app.js';

// [spec: MCP-002]
async function startDaemon() {
  const db = createDatabase();
  initSchema(db);
  const eventBus = new EventBus();

  const app = createApp({ db, eventBus });

  const port = Number(process.env.PORT || 4820);
  const hostname = process.env.HOST || '127.0.0.1';

  serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      console.log(`
╔═════════════════════════════════════════════════════════════════╗
║  Kaj (কাজ) Background Task Management & MCP Server             ║
╚═════════════════════════════════════════════════════════════════╝
- Web Dashboard: http://${info.address}:${info.port}
- Health Check:  http://${info.address}:${info.port}/api/health
- MCP Endpoint:  http://${info.address}:${info.port}/mcp (Streamable HTTP)
- SSE Live Push: http://${info.address}:${info.port}/events
- Memory RSS:    ~${memoryMb} MB (Low footprint daemon)
`);
    }
  );
}

startDaemon().catch((err) => {
  console.error('Failed to start Kaj daemon:', err);
  process.exit(1);
});
