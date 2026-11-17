# Tasks Specification (TASK)

This specification defines the task lifecycle, six-track Kanban workflow, dual-date scheduling, independent priority handling, and spawn-on-complete recurrence engine for Kaj (কাজ).

---

## TASK-001: Six-Column Kanban Workflow with In Progress Sub-Columns

The system shall organize active tasks into six ordered column tracks: Triage, Todo, In Progress (Today), In Progress (This Week), In Progress (This Month), and Tracking (Blocked / Delivery).

Acceptance Criteria:
- AC-TASK-001.1: Every active task shall hold exactly one status value from `triage`, `todo`, `in_progress_today`, `in_progress_week`, `in_progress_month`, or `tracking`.
- AC-TASK-001.2: Moving a task to `tracking` shall preserve its project assignment and support an optional waiting-on note which could be a parcel tracking link.
- AC-TASK-001.3: When a task is marked complete, the system shall transition its status to `done` and remove it from the active Kanban columns into the completed archive.
- AC-TASK-001.4: Reopening a completed task shall restore its status to `todo` at the top of its assigned project swimlane.

---

## TASK-002: Task Data Attributes and Schema Validation

The system shall validate all task attributes including task name, status, details, project, priority, action date, due date, repeat rule, and waiting-on notes.

Acceptance Criteria:
- AC-TASK-002.1: The system shall reject task creation or update requests where the title is empty or contains only whitespace.
- AC-TASK-002.2: Priority values shall be strictly validated against `today`, `week`, `month`, `quarter`, and `year`.
- AC-TASK-002.3: Repeat rule values shall be strictly validated against `none`, `weekly`, `monthly`, and `yearly`. Include an option when it repeats. Day of the week for the weekly tasks, Day of the month for the monthly tasks, Day of the year for the yearly tasks.
- AC-TASK-002.4: Action date and due date values shall be strictly validated as ISO-8601 calendar date strings in `DD-MM-YYYY` format or null.
- AC-TASK-002.5: The system shall allow creating tasks without an action date or without a due date.
- AC-TASK-002.6: The task schema shall support an optional `created_by` string attribute, defaulting to null, preserved across updates, and surfaced in task representations.

---

## TASK-003: Independence of Status and Priority Horizons

While moving a task across board columns or In Progress sub-columns, the system shall maintain the priority planning horizon without modification.

Acceptance Criteria:
- AC-TASK-003.1: When a task with priority `quarter` or `year` is transitioned to `in_progress_today`, the priority value shall remain `quarter` or `year`.
- AC-TASK-003.2: Transitioning a task between `in_progress_today`, `in_progress_week`, and `in_progress_month` shall update the status field only and leave the priority field intact.
- AC-TASK-003.3: Updating a task's priority field shall not alter its board status or column location.

---

## TASK-004: Spawn-on-Complete Recurrence Rollover

When a task with a repeat rule other than `none` is marked `done`, the system shall record completion of the current occurrence and atomically spawn the next instance in `triage` with an execution period indicator `[x]` appended to the title.

Acceptance Criteria:
- AC-TASK-004.1: When a weekly task is marked complete, the system shall create the next task in `triage` with action date and due date shifted forward to the repeat day of the week, and append `[x]` to the title where `x` is the week number (e.g. `[W45]` or `[45]`).
- AC-TASK-004.2: When a monthly task is marked complete, the system shall create the next task in `triage` with action date and due date shifted forward to the repeat date of the next month, and append `[x]` to the title where `x` is the month (e.g. `[11]` or month name).
- AC-TASK-004.3: When a yearly task is marked complete, the system shall create the next task in `triage` with action date and due date shifted forward to the repeat day of the next year, and append `[x]` to the title where `x` is the year (e.g. `[2027]`).
- AC-TASK-004.4: The newly spawned recurring task shall inherit the base title (replacing any prior period tag), details, project, priority, and repeat rule of the parent task.
- AC-TASK-004.5: The completed occurrence shall remain archived in status `done` with its `completed_at` timestamp recorded.

---

## TASK-005: Dual Date Scheduling and Calendar Projection

The system shall support independent action dates and due dates on tasks, allowing scheduling and calendar querying across Month and Week views.

Acceptance Criteria:
- AC-TASK-005.1: Querying a date window (including 7-day week and full-month spans) shall return all active tasks having an action date falling within that window.
- AC-TASK-005.2: Querying a date window (including 7-day week and full-month spans) shall return all active tasks having a due date falling within that window.
- AC-TASK-005.3: Tasks without an action date shall be returned in the unscheduled tasks query for drag-to-schedule assignment.
- AC-TASK-005.4: For recurring active tasks, the system shall project virtual preview occurrences onto dates within the queried calendar window without generating duplicate database rows.

---

## TASK-006: Task Intra-Column Ordering and Reordering

The system shall maintain and update the relative vertical display order of tasks within each status column and project swimlane.

Acceptance Criteria:
- AC-TASK-006.1: The task repository and API shall expose a reorder endpoint (`POST /api/tasks/reorder`) that accepts an array of task IDs and updates their `sort_order` sequentially.
- AC-TASK-006.2: The board query and swimlane groupers shall return active tasks within each column ordered by `sort_order` ascending.
- AC-TASK-006.3: If invalid or non-existent task IDs are provided to the reorder endpoint, the request shall be rejected with status 400.

## TASK-007: Automatic Triage-to-Todo Promotion for Matching Recurring Periods

While an active recurring task resides in `triage` and its scheduled period matches the current calendar week or month, the system shall promote the task status automatically to `todo`.

Acceptance Criteria:
- AC-TASK-007.1: When the calendar ISO week of today matches the action or due date of a weekly recurring task in `triage`, the system shall move that task to `todo` automatically without altering its priority or project.
- AC-TASK-007.2: When the calendar year-month or ISO week of today matches the action or due date of a monthly or yearly recurring task in `triage`, the system shall move that task to `todo` automatically without altering its priority or project.
- AC-TASK-007.3: When a recurring task in `triage` is scheduled for a future week or month relative to today, the system shall keep that task in `triage` until the matching period begins.
- AC-TASK-007.4: While evaluating tasks for automatic promotion, the system shall exclude non-recurring tasks, archived tasks, soft-deleted tasks, and tasks already outside `triage`.

## TASK-008: Automatic In-Progress-Today Promotion for Action Date Today

When any active task has an action date matching today's local calendar date, the system shall promote the task status automatically to In Progress (Today).

Acceptance Criteria:
- AC-TASK-008.1: When a scheduled promotion check runs or board state is fetched, the system shall move any non-completed task whose action date equals today's local calendar date from earlier workflow stages into In Progress (Today) without altering its priority, project, or dates.
- AC-TASK-008.2: When a new task is created or an existing task is updated with an action date equal to today's local calendar date while not marked completed, the system shall place or transition that task into In Progress (Today) automatically.
- AC-TASK-008.3: While evaluating tasks for today action promotion, the system shall exclude completed tasks, soft-deleted tasks, tasks already in In Progress (Today), and tasks awaiting external tracking.
- AC-TASK-008.4: When a recurring task in triage is due for period promotion and also carries today's action date, the system shall evaluate period promotion first and then promote the task into In Progress (Today).

## TASK-009: Automatic Triage-to-Todo Promotion for Current Monday-Start Week

When an active task in `triage` has an action date falling within the current Monday-to-Sunday calendar week, the system shall promote the task status automatically to `todo`.

Acceptance Criteria:
- AC-TASK-009.1: When evaluating whether a date belongs to the current week, the system shall treat Monday as the first day of the week and Sunday as the last day of the week.
- AC-TASK-009.2: When a scheduled promotion check runs or board state is fetched, the system shall move any non-deleted task in `triage` whose action date falls within the current Monday-to-Sunday week to `todo` without altering its priority, project, or dates.
- AC-TASK-009.3: When a new task is created in `triage` or an existing `triage` task is updated with an action date inside the current Monday-to-Sunday week, the system shall transition that task to `todo` automatically unless promoted further to In Progress (Today).
- AC-TASK-009.4: While evaluating tasks for current-week triage promotion, the system shall exclude tasks outside `triage`, soft-deleted tasks, dateless tasks, and tasks scheduled for past or future Monday-to-Sunday weeks.

## TASK-010: Automatic Completed Task Retention Purge and Telemetry Snapshot

When completed tasks exceed the configured 90-day retention window, the system shall snapshot their weekly, project, and creator aggregate counts into persistent telemetry storage and permanently purge those expired records from the active task store.

Acceptance Criteria:
- AC-TASK-010.1: Where the done retention window is unconfigured, the system shall apply a default retention period of 90 days based on each task completion timestamp.
- AC-TASK-010.2: Where the done retention environment setting specifies zero, the system shall disable automatic retention purging while retaining all completed tasks.
- AC-TASK-010.3: When purging expired completed tasks, the system shall atomically record aggregate counts by ISO year-week, project identifier, and creator identity in persistent telemetry snapshot storage before deleting those rows.
- AC-TASK-010.4: While evaluating completed tasks for retention purging, the system shall exclude non-completed tasks, already soft-deleted tasks, and completed tasks newer than the retention cutoff.
- AC-TASK-010.5: When the background daemon starts, runs its periodic maintenance schedule, or receives a manual purge request, the system shall execute the retention sweep and emit synchronization events when rows are purged.

## TASK-011: Automatic Roll-Forward of Past Action Dates for Incomplete Tasks

When scheduled maintenance executes or board state is fetched, the system shall update past action dates on active incomplete tasks to today's local calendar date.

Acceptance Criteria:
- AC-TASK-011.1: When scheduled maintenance or a board fetch executes, the system shall update the action date of any active non-completed task with an action date earlier than today's local calendar date to today's local calendar date.
- AC-TASK-011.2: When rolling forward an incomplete task with a past action date, the system shall preserve priority, project assignment, and due date and allow today-action promotion into In Progress (Today).
- AC-TASK-011.3: While evaluating tasks for past action-date roll-forward, the system shall exclude completed tasks, soft-deleted tasks, dateless tasks, and tasks whose action date equals or follows today.



