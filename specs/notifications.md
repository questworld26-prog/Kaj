# Notification Specification (NOTIF)

This specification defines the low-footprint automated Telegram notification engine for task lifecycle events in Kaj (কাজ), including completion alerts and VIP triage notifications.

---

## NOTIF-001: Automated Telegram Notifications for Task Lifecycle Events

When task lifecycle events occur, the system shall resolve author identities and dispatch automated Telegram notification alerts for task completion and VIP triage actions without local LLM overhead.

Acceptance Criteria:
- AC-NOTIF-001.1: When a task is marked complete, the system shall resolve the creator (`created_by`) to their configured Telegram user ID via `user_names` and dispatch an automated completion notification message with the task title and project attribution via Telegram, unless Telegram is disabled.
- AC-NOTIF-001.2: When a task created by a VIP user is moved from the unassigned inbox (`project_id == null`) in `triage` status to any other column or assigned to a project, the system shall dispatch an automated notification to the VIP creator via Telegram stating `Seen/Triaged: <task>`.

## NOTIF-002: Scheduled Daily Brief Task Digest for Non-VIP Telegram Members

When local time reaches the configured daily digest hour and today's digest has not yet been dispatched, the notification service shall send a single concise summary of active In Progress Today tasks with today's action dates ordered first exclusively to non-VIP Telegram recipients.

Acceptance Criteria:
- AC-NOTIF-002.1: Where daily digest delivery is enabled, the notification service shall resolve configured Telegram recipients and exclude every identity designated as a VIP user.
- AC-NOTIF-002.2: When selecting tasks for the daily digest, the notification service shall include active In Progress Today tasks ordered with today's action dates first followed by remaining In Progress Today items up to the configured item limit.
- AC-NOTIF-002.3: When formatting the daily digest message, the notification service shall render a single compact numbered summary containing task titles, optional project tags, and optional due dates without descriptions or per-task inline buttons.
- AC-NOTIF-002.4: When local wall-clock time reaches or passes the configured digest time (default 08:00), the notification service shall send the digest once per calendar day per non-VIP recipient and persist dispatch state across restarts.
- AC-NOTIF-002.5: Where empty-day suppression is enabled and zero In Progress Today tasks exist, the notification service shall skip sending the daily digest without raising an error.

