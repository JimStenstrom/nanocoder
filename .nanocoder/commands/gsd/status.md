---
description: Show current workflow progress
aliases: [gsd-status, progress, gsd-progress]
---

# Workflow Status

Display a clear overview of the current project progress.

## Step 1: Load All Planning Documents

Read all GSD documents:
1. `.nanocoder/gsd/PROJECT.md` - Project overview
2. `.nanocoder/gsd/ROADMAP.md` - All phases
3. `.nanocoder/gsd/STATE.md` - Current progress
4. `.nanocoder/gsd/PLAN.md` - Current phase tasks

If documents don't exist, inform the user: "No workflow initialized. Run `/gsd:init` to start."

## Step 2: Generate Status Report

Format and display a comprehensive status report:

```markdown
# Project Status: [Project Name]

## Overview
[1-2 sentence project description from PROJECT.md]

---

## Progress

**Current Phase:** [N] of [Total] - [Phase Name]
**Phase Status:** [not_started | in_progress | completed]

### Phase Progress Bar
[████████░░░░░░░░░░░░] 40% (2/5 tasks)

---

## Roadmap Overview

| Phase | Name | Status | Tasks |
|-------|------|--------|-------|
| 1 | Foundation | ✅ Completed | 4/4 |
| 2 | Core Features | 🔄 In Progress | 2/5 |
| 3 | Polish | ⏳ Pending | 0/3 |

---

## Current Phase: [Phase Name]

### Tasks

| # | Task | Status |
|---|------|--------|
| 2.1 | Setup database schema | ✅ Completed |
| 2.2 | Create API endpoints | ✅ Completed |
| 2.3 | Add authentication | 🔄 In Progress |
| 2.4 | Implement validation | ⏳ Pending |
| 2.5 | Add error handling | ⏳ Pending |

### Current Task Details
**Task 2.3: Add authentication**
- Actions remaining: 2 of 4
- Blockers: None
- Next action: Create auth middleware

---

## Session Log (Recent)
- [timestamp] Completed task 2.2
- [timestamp] Started task 2.3
- [timestamp] Created file src/auth/middleware.ts

---

## Quick Actions
- `/gsd:next` - Execute next task
- `/gsd:plan` - Re-plan current phase
- `/checkpoint create` - Save current state
```

## Step 3: Highlight Issues

If there are any issues, prominently display them:

```markdown
## ⚠️ Attention Required

- **Blocked Task:** Task 2.3 is blocked - "Auth provider not configured"
- **Failed Verification:** Task 2.2 test is failing
- **Stale Plan:** PLAN.md hasn't been updated in 2+ hours
```

## Step 4: Suggest Next Steps

Based on current state, suggest the most appropriate action:

- If task in progress: "Continue with `/gsd:next`"
- If phase complete: "Start next phase with `/gsd:plan`"
- If blocked: "Resolve blocker, then `/gsd:next`"
- If project complete: "All phases complete! Review and finalize."

## Display Guidelines

- Use status icons consistently: ✅ ⏳ 🔄 ❌ ⚠️
- Keep the report scannable (use tables and lists)
- Show percentages and ratios for quick understanding
- Highlight the current task prominently
- Include timestamps for context
- Suggest next actions based on state
