# User Interface Specification (UI)

This specification defines the Bento full-width layout, Chronos dark-mode color palette, interactive Calendar view, and light-dismiss task editor dialog for Kaj (কাজ).

---

## UI-001: Bento Full-Width Layout, Swimlane Pods, and Consolidated In-Progress Chamber

The system shall render a full-width Kanban board without a left sidebar, utilizing floating command chrome, sticky column headers, rounded dark Swimlane Pods, and a consolidated In Progress chamber containing Today, This Week, and This Month execution horizons.

Acceptance Criteria:
- AC-UI-001.1: The board view shall dedicate 100% of viewport width across Triage, Todo, a consolidated In Progress chamber spanning 3 column widths, and Tracking.
- AC-UI-001.2: Projects shall render as rounded container pods with collapsible swimlane headers and task counts.
- AC-UI-001.3: Tracking column cards shall render with dashed borders and dedicated carrier/blocker badge indicators.
- AC-UI-001.4: Dragging or selecting a card shall allow moving tasks across columns and swimlanes.
- AC-UI-001.5: The UI shall provide controls to reorder project swimlanes, persisting the new sort order and updating the board layout immediately.
- AC-UI-001.6: The In Progress chamber within each swimlane shall render as a unified elevated box with an "In Progress" badge, housing 3 sub-columns with distinct horizon icons: Today (`⚡`) on an accented focus plate, This Week (`📅`), and This Month (`🗓`).
- AC-UI-001.7: Clicking on an empty space or add action within a Kanban column cell or project swimlane shall open the task creation dialog with that column's status and the swimlane's project pre-populated.

---

## UI-002: Chronos Dark-Mode Color Palette and Accessibility Tokens

The system shall style the user interface with the Chronos dark-mode design system maintaining strict accessibility contrast.

Acceptance Criteria:
- AC-UI-002.1: Surface tokens shall enforce Deep Graphite canvas (`#0E1111`), elevated pods (`#121718`), and card backgrounds (`#1C2224`).
- AC-UI-002.2: Primary action and execution accents shall use Emerald/Mint (`#10B981` / `#34D399`), while Tracking accents shall use warm gold (`#EAB308`).
- AC-UI-002.3: All text shall maintain a minimum 4.5:1 contrast ratio against card and surface backgrounds, and non-text component boundaries shall maintain at least 3:1 contrast.

---

## UI-003: Interactive Calendar with Dual-Date Badges and Scheduling Sidebar

The system shall provide an interactive Calendar view featuring Month and Week horizons, distinct Action Date and Due Date badges, a filter toggle, an Unscheduled Tasks sidebar with drag-to-schedule, and click-to-create task actions from calendar day cells.

Acceptance Criteria:
- AC-UI-003.1: The Calendar view shall display Action Dates (`▶`) and Due Dates (`⚑`) with distinct visual styling and icons.
- AC-UI-003.2: The Calendar filter toggle shall allow viewing Action Dates only, Due Dates only, or both concurrently.
- AC-UI-003.3: The Unscheduled sidebar shall list active tasks lacking an action date, allowing scheduling onto a calendar date.
- AC-UI-003.4: The Calendar view shall provide a toggle between Month view (multi-week month grid) and Week view (detailed 7-day grid), adapting layout and task density to the selected timeframe.
- AC-UI-003.5: The Calendar view shall allow dragging scheduled tasks between calendar day cells to update their action date.
- AC-UI-003.6: Clicking on a day cell or date header in the Calendar view (Month or Week grid) shall open the task creation dialog with the selected date pre-populated as the action date.

---

## UI-004: Light-Dismiss Task Editor Dialog and Completed Archive Drawer

The system shall provide a native light-dismiss modal dialog for task creation and editing, featuring an inline emoji prefix picker with categorized popover, and a toggleable archive drawer for completed tasks.

Acceptance Criteria:
- AC-UI-004.1: The task modal shall use `<dialog closedby="any">` with backdrop blur, supporting dismissal via Esc key or outside backdrop click.
- AC-UI-004.2: The task modal shall expose inputs for name, status, project, independent priority, action date, due date, repeat rule, waiting note, creator (created_by), and details.
- AC-UI-004.3: The completed archive drawer shall list tasks with status `done` and provide one-click restoration back to active board status.
- AC-UI-004.4: The task modal shall provide an emoji prefix button beside the task title input that opens a palette of quick work emojis and updates or prepends the chosen emoji into the task title.
- AC-UI-004.5: The task modal shall provide a toggle button to reveal a formatting toolbar for Task Details & Notes (defaulting to hidden/off) supporting bold, italic, underline, bullet list, and numbered list formatting.

---

## UI-005: Card Density Display Options and Intra-Column Drag Reordering

The board interface shall provide controls to toggle between Compact and Minimal task card densities and drag-reorder tasks vertically within column cells.

Acceptance Criteria:
- AC-UI-005.1: The board view shall provide a density display mode selector offering Compact and Minimal options, omitting comfortable mode.
- AC-UI-005.2: In Compact mode, the card shall hide the quick status footer and show dates inline to maintain a streamlined card height.
- AC-UI-005.3: In Minimal mode, the card shall render as an ultra-dense single-line row displaying completion button, priority indicator, and title to minimize board height.
- AC-UI-005.4: The selected density display mode shall persist across browser page reloads in local storage.
- AC-UI-005.5: Dragging a task card over another task within the same column cell shall reorder the tasks and persist the updated order immediately.

## UI-006: Responsive Mobile Layout, Execution Cockpit, and Touch Action Sheets

When the viewport width is below 768px, the system shall provide a mobile-optimized execution interface featuring an Execution Cockpit, Project Swimlane Pods, a 7-Day Calendar, Triage Queue, and one-thumb bottom action sheets, while preserving the full desktop layout on wider viewports.

Acceptance Criteria:
- AC-UI-006.1: When the viewport width is below 768px, the system shall display a sticky bottom navigation dock featuring Cockpit, Pods, Calendar, and Triage tabs, while maintaining the desktop layout on viewports 768px and wider.
- AC-UI-006.2: On the Cockpit tab, the system shall display a pinned Today Focus Plate with active today tasks, a dedicated Tracking container, and collapsible Week and Month horizons.
- AC-UI-006.3: On the Pods tab, the system shall display collapsible project swimlane pods with project filter chips, reorder buttons, and horizon sub-filters.
- AC-UI-006.4: On the Calendar tab, the system shall display a 7-day date strip, a daily agenda list, and an unscheduled task drawer with one-tap action and due scheduling buttons.
- AC-UI-006.5: When a task status pill is tapped on mobile, the system shall open a touch-friendly bottom action sheet to move the task between columns, change project pod, or complete the task.

## UI-007: Omnipresent Top Search Filter and Mobile Minimal Density Default

The system shall provide an omnipresent search input in the top command bar across desktop and mobile viewports that filters active Kanban and Calendar views by task title and details, and shall default mobile viewports to Minimal card density.

Acceptance Criteria:
- AC-UI-007.1: The top command bar shall render a search input on both desktop and mobile viewports with placeholder "Search tasks...".
- AC-UI-007.2: When a search query is entered, the Kanban board view shall filter tasks in real-time across all swimlanes and columns, displaying only tasks matching the title or details (case-insensitive).
- AC-UI-007.3: When a search query is entered, the Calendar view shall filter tasks in real-time across the calendar horizon grid, agenda, and unscheduled sidebar, displaying only tasks matching the title or details.
- AC-UI-007.4: The search input shall provide a clear button (`✕`) when text is present, immediately restoring the unfiltered view upon selection.
- AC-UI-007.5: On mobile viewports below 768px without a stored density preference, the card density shall default to Minimal mode.
- AC-UI-007.6: When a search query is entered, the system shall match tasks against the creator (`created_by`) attribute in addition to title and details across Kanban, Calendar, and Cockpit views.

## UI-008: Multi-Modal Task Completion Interactions

The system shall provide distinct, high-affordance completion interactions across desktop and mobile interfaces, including card circular checkboxes, a direct modal completion action, and mobile swipe-to-complete gestures.

Acceptance Criteria:
- AC-UI-008.1: In both Compact and Minimal desktop board views, each task card shall render a prominent circular completion checkbox on its left boundary with emerald hover styling, allowing 1-click completion.
- AC-UI-008.2: In the task modal dialog, an explicit "✓ Mark Complete" button shall be provided for existing active tasks, marking the task complete and closing the dialog upon click.
- AC-UI-008.3: On mobile viewports, swiping a task card to the right past the completion threshold shall trigger task completion and archiving.

---

## UI-009: Desktop Cockpit Execution Screen with Performance Telemetry Charts

The system shall provide a dedicated Cockpit view for desktop viewports (>= 768px) accessible via the top navigation switcher, featuring a split layout with execution focus on the left and live telemetry charts on the right.

Acceptance Criteria:
- AC-UI-009.1: The desktop top command bar navigation switcher shall provide Cockpit, Kanban Board, and Calendar options, persisting view changes and navigating to the Desktop Cockpit.
- AC-UI-009.2: The Desktop Cockpit shall render a 2-column split layout with execution focus on the left (featuring an accented Today Focus Plate, dashed Tracking & Waiting On container, and upcoming horizon tasks) and a telemetry analytics column on the right.
- AC-UI-009.3: The Desktop Cockpit telemetry section shall render a weekly completion velocity chart displaying completed tasks grouped across the recent 6 weeks.
- AC-UI-009.4: The Desktop Cockpit telemetry section shall render a project distribution chart displaying completed tasks proportioned across projects.
- AC-UI-009.5: The Desktop Cockpit telemetry section shall render a horizontal stacked bar chart showing completed tasks segmented by creator (`created_by`) across weeks.
- AC-UI-009.6: The Desktop Cockpit execution column shall render a dedicated VIP Triage Plate (`cockpit-vip-triage-plate`) positioned directly above the Today Focus Plate, displaying all tasks created by a configured VIP user that are in status `triage` without an assigned project (`project_id == null`).





