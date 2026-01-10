---
description: Mark the current task as complete
aliases: [gsd-done, task-done, complete-task]
parameters: [task_id]
---

# Mark Task Complete

Manually mark a task as completed and update all tracking documents.

## Usage

- `/gsd:done` - Mark the current in-progress task as complete
- `/gsd:done 2.3` - Mark a specific task as complete

## Step 1: Identify Task

If `{{task_id}}` is provided:
- Find the specified task in PLAN.md
- Verify it exists

If no task_id:
- Read STATE.md to find the current in-progress task
- If no task is in progress, inform user: "No task currently in progress. Use `/gsd:next` to start a task."

## Step 2: Confirm Completion

Before marking complete, ask the user to confirm:

```markdown
## Marking Task Complete

**Task:** [phase].[task] - [Task Name]

**Verification checklist:**
- [ ] [Verification 1 from task]
- [ ] [Verification 2 from task]
- [ ] [Verification 3 from task]

Have all verifications passed? (yes/no)
```

If user confirms "yes", proceed. If "no", ask what failed and offer to help fix it.

## Step 3: Update PLAN.md

Change the task status:

```markdown
## Task [phase].[task]: [Task Name]

**Status:** completed  <!-- Changed from in_progress -->
**Completed:** [timestamp]
```

## Step 4: Update STATE.md

Update progress tracking:

```markdown
## Current State

## Status: IN_PROGRESS

## Current Phase: [N]
## Current Task: [next pending task, or "Phase complete"]

## Progress
- Phases Completed: [X]/[Total]
- Tasks Completed: [Y+1]/[Phase Total]  <!-- Increment -->

## Last Updated: [timestamp]

## Session Log
- [timestamp] Completed task [phase].[task]: [Task Name]  <!-- Add entry -->
[... previous entries ...]
```

## Step 5: Git Commit (Optional)

If the task involved code changes, offer to commit:

```
Would you like me to commit these changes?

Suggested commit message:
"[YYYY-MM-DD] feat: [task description]"

(yes/no/custom message)
```

If yes:
```bash
git add -A && git commit -m "[message]"
```

## Step 6: Report and Suggest Next

```markdown
## ✅ Task Complete

**Completed:** [phase].[task] - [Task Name]
**Time:** [timestamp]

### Progress Update
- Phase [N]: [X+1]/[Total] tasks complete
- Overall: [Y]% complete

### Next Steps
- `/gsd:next` - Start the next task
- `/gsd:status` - View full progress
- `/gsd:plan` - Adjust remaining tasks
```

## Special Cases

### Completing Out-of-Order Tasks

If marking a task complete that isn't the current one:
1. Warn the user: "Task [X] is not the current task. This may indicate skipped dependencies."
2. Ask to confirm: "Proceed anyway? (yes/no)"
3. If yes, update both tasks appropriately

### Marking Blocked Tasks Complete

If the task was previously blocked:
1. Ask what resolved the blocker
2. Clear the blocker note from PLAN.md
3. Proceed with normal completion

### Phase Completion

If this was the last task in the phase:
1. Update PLAN.md to show phase complete
2. Update STATE.md: increment phases completed
3. Congratulate user and suggest `/gsd:plan` for next phase

```markdown
## 🎉 Phase [N] Complete!

All tasks in "[Phase Name]" have been completed.

### Phase Summary
- Tasks completed: [X]
- Duration: [time since phase start]

### Next Phase: [N+1] - [Phase Name]
Run `/gsd:plan` to create the task breakdown for the next phase.
```
