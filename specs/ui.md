# User Interface Specification (UI)

This specification defines the Bento full-width layout, Chronos dark-mode color palette, interactive Calendar view, and light-dismiss task editor dialog for Kaj (কাজ).

---

## UI-001: Bento Full-Width 6-Column Layout and Swimlane Pods

The system shall render a full-width Kanban board without a left sidebar, utilizing floating command chrome, sticky 6-track column headers, and rounded dark Swimlane Pods.

Acceptance Criteria:
- AC-UI-001.1: The board view shall dedicate 100% of viewport width to columns: Triage, Todo, In Progress (Today, This Week, This Month), and Tracking.
- AC-UI-001.2: Projects shall render as rounded container pods with collapsible swimlane headers and task counts.
- AC-UI-001.3: Tracking column cards shall render with dashed borders and dedicated carrier/blocker badge indicators.
- AC-UI-001.4: Dragging or selecting a card shall allow moving tasks across columns and swimlanes.
- AC-UI-001.5: The UI shall provide controls to reorder project swimlanes, persisting the new sort order and updating the board layout immediately.

---

## UI-002: Chronos Dark-Mode Color Palette and Accessibility Tokens

The system shall style the user interface with the Chronos dark-mode design system maintaining strict accessibility contrast.

Acceptance Criteria:
- AC-UI-002.1: Surface tokens shall enforce Deep Graphite canvas (`#0E1111`), elevated pods (`#121718`), and card backgrounds (`#1C2224`).
- AC-UI-002.2: Primary action and execution accents shall use Emerald/Mint (`#10B981` / `#34D399`), while Tracking accents shall use warm gold (`#EAB308`).
- AC-UI-002.3: All text shall maintain a minimum 4.5:1 contrast ratio against card and surface backgrounds, and non-text component boundaries shall maintain at least 3:1 contrast.

---

## UI-003: Interactive Calendar with Dual-Date Badges and Scheduling Sidebar

The system shall provide an interactive Calendar view featuring Month and Week horizons, distinct Action Date and Due Date badges, a filter toggle, and an Unscheduled Tasks sidebar with drag-to-schedule.

Acceptance Criteria:
- AC-UI-003.1: The Calendar view shall display Action Dates (`▶`) and Due Dates (`⚑`) with distinct visual styling and icons.
- AC-UI-003.2: The Calendar filter toggle shall allow viewing Action Dates only, Due Dates only, or both concurrently.
- AC-UI-003.3: The Unscheduled sidebar shall list active tasks lacking an action date, allowing scheduling onto a calendar date.
- AC-UI-003.4: The Calendar view shall provide a toggle between Month view (multi-week month grid) and Week view (detailed 7-day grid), adapting layout and task density to the selected timeframe.
- AC-UI-003.5: The Calendar view shall allow dragging scheduled tasks between calendar day cells to update their action date.

---

## UI-004: Light-Dismiss Task Editor Dialog and Completed Archive Drawer

The system shall provide a native light-dismiss modal dialog for task creation and editing, and a toggleable archive drawer for completed tasks.

Acceptance Criteria:
- AC-UI-004.1: The task modal shall use `<dialog closedby="any">` with backdrop blur, supporting dismissal via Esc key or outside backdrop click.
- AC-UI-004.2: The task modal shall expose inputs for name, status, project, independent priority, action date, due date, repeat rule, waiting note, and details.
- AC-UI-004.3: The completed archive drawer shall list tasks with status `done` and provide one-click restoration back to active board status.

