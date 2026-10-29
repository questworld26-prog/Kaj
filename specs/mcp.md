# Model Context Protocol Specification (MCP)

This specification defines the Model Context Protocol (MCP) server architecture, tool catalog, dual transport support (Streamable HTTP and stdio), and safety controls for Kaj (কাজ).

---

## MCP-001: Task and Project MCP Tool Suite

The system shall expose a standard Model Context Protocol tool suite enabling AI agents to query, create, update, move, complete, and delete tasks and projects.

Acceptance Criteria:
- AC-MCP-001.1: The `query_tasks` tool shall filter tasks by status array, project ID, priority array, action date range, due date range, overdue status, and search string.
- AC-MCP-001.2: The `create_task` tool shall accept title, status, project ID, priority, action date, due date, repeat rule, waiting-on note, and details, returning the created task.
- AC-MCP-001.3: The `update_task` tool shall accept partial updates for task fields by task ID and return the updated entity.
- AC-MCP-001.4: The `move_task` tool shall relocate a task to a target column or project swimlane with an optional waiting-on note.
- AC-MCP-001.5: The `complete_task` tool shall transition a task to done, execute repeat rollover if applicable, and return the archived task plus any newly spawned occurrence.
- AC-MCP-001.6: The `list_projects` and `save_project` tools shall support full management of project swimlanes.

---

## MCP-002: Dual Transport Protocol Support

The system shall support both Streamable HTTP transport on the background daemon and a standalone stdio CLI transport for local agents.

Acceptance Criteria:
- AC-MCP-002.1: The background daemon shall expose a Streamable HTTP endpoint on `POST /mcp` handling standard MCP JSON-RPC protocol requests.
- AC-MCP-002.2: The system shall provide a standalone stdio entrypoint (`dist/mcp/stdio.js`) capable of executing MCP commands over standard input/output.
- AC-MCP-002.3: Task or project mutations executed via MCP shall immediately broadcast an SSE notification to connected browser clients to update the UI in real-time.
- AC-MCP-002.4: The background daemon shall bind by default to all network interfaces (`0.0.0.0`) permitting local network access (e.g. via `jarvis.local` or LAN IP) from other devices on WiFi or LAN, while supporting configurable `HOST` and `PORT`.

---

## MCP-003: Safety Annotations and Soft-Delete Protection

The system shall provide accurate MCP annotations for host permission models and prevent irrecoverable data loss from agent operations.

Acceptance Criteria:
- AC-MCP-003.1: Read tools (`query_tasks`, `get_task`, `get_board_summary`, `list_projects`) shall declare `readOnlyHint: true`.
- AC-MCP-003.2: The `delete_task` tool shall declare `destructiveHint: true` and perform a soft-delete by recording `deleted_at`.
- AC-MCP-003.3: The system shall provide a `restore_task` tool to recover soft-deleted tasks back to active state.
- AC-MCP-003.4: The HTTP endpoint on `POST /mcp` and REST API endpoints shall guard against DNS rebinding and cross-origin attacks by validating the `Origin` and `Host` headers against trusted local origins (loopback, local mDNS `.local` domains, and private RFC 1918 LAN IPs).

