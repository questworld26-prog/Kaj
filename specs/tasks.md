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

---

## TASK-003: Independence of Status and Priority Horizons

While moving a task across board columns or In Progress sub-columns, the system shall maintain the priority planning horizon without modification.

Acceptance Criteria:
- AC-TASK-003.1: When a task with priority `quarter` or `year` is transitioned to `in_progress_today`, the priority value shall remain `quarter` or `year`.
- AC-TASK-003.2: Transitioning a task between `in_progress_today`, `in_progress_week`, and `in_progress_month` shall update the status field only and leave the priority field intact.
- AC-TASK-003.3: Updating a task's priority field shall not alter its board status or column location.

---

## TASK-004: Spawn-on-Complete Recurrence Rollover

When a task with a repeat rule other than `none` is marked `done`, the system shall record completion of the current occurrence and atomically spawn the next instance in `todo`.

Acceptance Criteria:
- AC-TASK-004.1: When a weekly task is marked complete, the system shall create the next task in `todo` with action date and due date shifted forward to the repeat day of the week.
- AC-TASK-004.2: When a monthly task is marked complete, the system shall create the next task in `todo` with action date and due date shifted forward the repeat date of the next month.
- AC-TASK-004.3: When a yearly task is marked complete, the system shall create the next task in `todo` with action date and due date shifted forward to the repeat day of the next year.
- AC-TASK-004.4: The newly spawned recurring task shall inherit the title, details, project, priority, and repeat rule of the parent task.
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


