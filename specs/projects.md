# Projects Specification (PROJ)

This specification defines project entity management, swimlane ordering, visual color accents, and the default Unassigned Inbox swimlane for Kaj (কাজ).

---

## PROJ-001: Project Entity Management and Swimlane Ordering

The system shall organize the Kanban board into project swimlanes with custom color accents and deterministic vertical ordering.

Acceptance Criteria:
- AC-PROJ-001.1: Each project entity shall possess a unique identifier, unique name, color token, integer sort order, and archived flag.
- AC-PROJ-001.2: The system shall provide endpoints to create, update, reorder, and archive projects.
- AC-PROJ-001.3: Archiving a project shall hide its swimlane from the active board while preserving historical tasks and relations.
- AC-PROJ-001.4: Renaming or recoloring a project shall update the swimlane header in real-time across connected clients.

---

## PROJ-002: Default Unassigned Inbox Swimlane

The system shall provide a top-level Unassigned / Quick Triage swimlane for tasks created without a specified project.

Acceptance Criteria:
- AC-PROJ-002.1: Tasks created with a null `project_id` shall automatically map to the Unassigned swimlane.
- AC-PROJ-002.2: The Unassigned swimlane shall always display at the top of the Kanban board preceding all named project swimlanes.
- AC-PROJ-002.3: The system shall allow reassigning a task from the Unassigned swimlane to any project or removing its project assignment back to Unassigned.

