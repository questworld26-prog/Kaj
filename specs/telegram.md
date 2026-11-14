# Telegram Bot Integration Specification (TG)

This specification defines the low-footprint, deterministic Telegram bot integration, configuration loader, feature toggle flag, shorthand task parser, search commands, and interactive inline keyboard callbacks for Kaj (কাজ).

---

## TG-001: Configurable Deterministic Telegram Bot for Task Creation, Search, and Quick Actions

When the Telegram integration feature flag is enabled, the system shall load credentials from environment configuration (`.env` or optional JSON override) and provide deterministic task creation (with shorthand parsing), task search, and inline status/completion actions without local LLM overhead.

Acceptance Criteria:
- AC-TG-001.1: The system shall load Telegram configuration (`enabled`, `bot_token`, `allowed_user_ids`, `default_status`, `poll_interval_ms`) from `.env` variables (`KAJ_TELEGRAM_ENABLED`, `KAJ_TELEGRAM_BOT_TOKEN`, `KAJ_TELEGRAM_ALLOWED_USER_IDS`) with optional JSON fallback (`KAJ_TELEGRAM_CONFIG`), and allow toggling `enabled` at runtime.
- AC-TG-001.2: When `enabled` is `false` or `bot_token` is not configured, the Telegram polling service shall remain inactive with zero network requests.
- AC-TG-001.3: When `allowed_user_ids` is non-empty, the bot shall reject messages and callback queries from any Telegram user ID not in `allowed_user_ids`.
- AC-TG-001.4: Sending `/add <text>` or a plain text message shall parse deterministic shorthand tokens (`#ProjectName`, `!today`/`!week`/`!month`/`!todo`/`!triage`/`!track`, `@today`/`@tomorrow`/`@DD-MM`/`@DD-MM-YYYY`/`@YYYY-MM-DD`, `due:today`/`due:tomorrow`/`due:DD-MM`/`due:DD-MM-YYYY`/`due:YYYY-MM-DD`, `wait:<note>`) to create a task in SQLite and broadcast an SSE event. When `DD-MM` is provided, the system shall infer the current year from the message arrival timestamp, and format dates in Telegram replies using `DD-MM-YYYY`.
- AC-TG-001.5: Sending `/search <query>`, `/s <query>`, or `? <query>` shall search active tasks across `title` and `details` (case-insensitive) and reply with matching tasks accompanied by inline keyboard action buttons (`✓ Done`, `⚡ Today`, `📅 Week`, `🗓 Month`, `Todo`).
- AC-TG-001.6: Sending `/today` shall list all active tasks in `in_progress_today`, and tapping an inline keyboard callback button (`done:<id>`, `status:<id>:<status>`) shall immediately update the task in SQLite and broadcast an SSE event.
- AC-TG-001.7: The system shall support a `user_names` dictionary via `KAJ_TELEGRAM_USER_NAMES` (or JSON config) mapping user IDs or usernames to names, attributing tasks to the configured creator name (falling back to Telegram username or user ID) in `created_by`.
- AC-TG-001.8: When loading configuration, the system shall support designating VIP users via `KAJ_TELEGRAM_USER_NAMES` (`[VIP]` suffix or `{ "name": "...", "vip": true }` object) or `KAJ_TELEGRAM_VIP_USERS`, exposing the resolved VIP user identities via `GET /api/vip-users`.



