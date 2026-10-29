# Telegram Bot Integration Specification (TG)

This specification defines the low-footprint, deterministic Telegram bot integration, configuration loader, feature toggle flag, shorthand task parser, search commands, and interactive inline keyboard callbacks for Kaj (কাজ).

---

## TG-001: Configurable Deterministic Telegram Bot for Task Creation, Search, and Quick Actions

When the Telegram integration feature flag is enabled, the system shall load credentials from a dedicated configuration file and provide deterministic task creation (with shorthand parsing), task search, and inline status/completion actions without local LLM overhead.

Acceptance Criteria:
- AC-TG-001.1: The system shall load Telegram configuration (`enabled`, `bot_token`, `allowed_user_ids`, `default_status`, `poll_interval_ms`) from a JSON configuration file (`telegram.config.json` or path specified via `KAJ_TELEGRAM_CONFIG`) and allow overriding the `enabled` flag via environment variable (`KAJ_TELEGRAM_ENABLED=true|false`) or runtime toggle.
- AC-TG-001.2: When `enabled` is `false` or `bot_token` is not configured, the Telegram polling service shall remain inactive with zero network requests.
- AC-TG-001.3: When `allowed_user_ids` is non-empty, the bot shall reject messages and callback queries from any Telegram user ID not in `allowed_user_ids`.
- AC-TG-001.4: Sending `/add <text>` or a plain text message shall parse deterministic shorthand tokens (`#ProjectName`, `!today`/`!week`/`!month`/`!todo`/`!triage`/`!track`, `@today`/`@tomorrow`/`@YYYY-MM-DD`, `due:today`/`due:tomorrow`/`due:YYYY-MM-DD`, `wait:<note>`) to create a task in SQLite and broadcast an SSE event.
- AC-TG-001.5: Sending `/search <query>`, `/s <query>`, or `? <query>` shall search active tasks across `title` and `details` (case-insensitive) and reply with matching tasks accompanied by inline keyboard action buttons (`✓ Done`, `⚡ Today`, `📅 Week`, `🗓 Month`, `Todo`).
- AC-TG-001.6: Sending `/today` shall list all active tasks in `in_progress_today`, and tapping an inline keyboard callback button (`done:<id>`, `status:<id>:<status>`) shall immediately update the task in SQLite and broadcast an SSE event.

