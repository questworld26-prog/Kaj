# Notification Specification (NOTIF)

This specification defines the low-footprint automated Telegram notification engine for task lifecycle events in Kaj (কাজ), including completion alerts and VIP triage notifications.

---

## NOTIF-001: Automated Telegram Notifications for Task Lifecycle Events

When task lifecycle events occur, the system shall resolve author identities and dispatch automated Telegram notification alerts for task completion and VIP triage actions without local LLM overhead.

Acceptance Criteria:
- AC-NOTIF-001.1: When a task is marked complete, the system shall resolve the creator (`created_by`) to their configured Telegram user ID via `user_names` and dispatch an automated completion notification message with the task title and project attribution via Telegram, unless Telegram is disabled or `task_completed` is omitted from their subscriptions.
- AC-NOTIF-001.2: When a task created by a user subscribed to `task_triaged` is moved from the unassigned inbox (`project_id == null`) in `triage` status to any other column or assigned to a project, the system shall dispatch an automated notification to that creator via Telegram stating `Seen/Triaged: <task>`.

## NOTIF-002: Scheduled Daily Brief Task Digest for Non-VIP Telegram Members

When local time reaches the configured daily digest hour and today's digest has not yet been dispatched, the notification service shall send a single concise summary of active In Progress Today tasks with today's action dates ordered first to subscribed Telegram recipients.

Acceptance Criteria:
- AC-NOTIF-002.1: Where daily digest delivery is enabled, the notification service shall resolve configured Telegram recipients subscribed to the `daily_digest` notification type and exclude unsubscribed users.
- AC-NOTIF-002.2: When selecting tasks for the daily digest, the notification service shall include active In Progress Today tasks ordered with today's action dates first followed by remaining In Progress Today items up to the configured item limit.
- AC-NOTIF-002.3: When formatting the daily digest message, the notification service shall render a single compact numbered summary containing task titles, optional project tags, and optional due dates without descriptions or per-task inline buttons.
- AC-NOTIF-002.4: When local wall-clock time reaches or passes the configured digest time (default 08:00), the notification service shall send the digest once per calendar day per subscribed recipient and persist dispatch state across restarts.
- AC-NOTIF-002.5: Where empty-day suppression is enabled and zero In Progress Today tasks exist, the notification service shall skip sending the daily digest without raising an error.

## NOTIF-003: Per-User Telegram Notification Subscriptions

When loading Telegram user configuration, the notification service shall map each user identifier to an explicit list of subscribed notification types (`task_completed`, `task_triaged`, `daily_digest`, `backup_status`) to govern outbound Telegram delivery.

Acceptance Criteria:
- AC-NOTIF-003.1: Where a user entry in `KAJ_TELEGRAM_USER_NAMES` defines a `notifications` list, the configuration loader shall parse valid notification keys and preserve explicit empty lists to mute all automated alerts for that user.
- AC-NOTIF-003.2: Where a user entry omits a `notifications` list, the configuration loader shall assign `task_completed` and `task_triaged` to VIP users and `task_completed`, `daily_digest`, and `backup_status` to non-VIP users.
- AC-NOTIF-003.3: When dispatching creator-scoped alerts (`task_completed` or `task_triaged`) or broadcast alerts (`daily_digest` or `backup_status`), the notification service shall deliver each notification type exclusively to authorized users holding that type in their active subscriptions.
- AC-NOTIF-003.4: When querying Telegram status via `GET /api/telegram/status`, the system shall include resolved `user_notifications` per user alongside `vip_users` without exposing secret credentials.

