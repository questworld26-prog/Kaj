# Notification Specification (NOTIF)

This specification defines the low-footprint automated Telegram notification engine for task lifecycle events in Kaj (কাজ), including completion alerts and VIP triage notifications.

---

## NOTIF-001: Automated Telegram Notifications for Task Lifecycle Events

When task lifecycle events occur, the system shall resolve author identities and dispatch automated Telegram notification alerts for task completion and VIP triage actions without local LLM overhead.

Acceptance Criteria:
- AC-NOTIF-001.1: When a task is marked complete, the system shall resolve the creator (`created_by`) to their configured Telegram user ID via `user_names` and dispatch an automated completion notification message with the task title and project attribution via Telegram, unless Telegram is disabled.
- AC-NOTIF-001.2: When a task created by a VIP user is moved from the unassigned inbox (`project_id == null`) in `triage` status to any other column or assigned to a project, the system shall dispatch an automated notification to the VIP creator via Telegram stating `Seen/Triaged: <task>`.

