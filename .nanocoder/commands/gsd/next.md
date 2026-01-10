---
description: Execute the next task in the current phase
aliases: [gsd-next, next-task, gsd-exec]
---

# Execute Next Task

You are executing the next pending task from the current phase plan. Follow the structured approach to ensure quality and traceability.

## Step 1: Load Current State

Read the planning documents:

1. `.nanocoder/gsd/STATE.md` - Get current phase and task
2. `.nanocoder/gsd/PLAN.md` - Get the detailed task to execute

If these files don't exist, tell the user to run `/gsd:init` and `/gsd:plan` first.

## Step 2: Find Next Task

From PLAN.md, find the first task with `Status: pending`. If all tasks are completed, check if there's a next phase in ROADMAP.md.

If no pending tasks remain:
- Update STATE.md to mark phase as complete
- Inform user: "Phase [N] complete! Run `/gsd:plan` to start the next phase, or `/gsd:status` to see overall progress."

## Step 3: Announce Task

Before executing, clearly state:

```
## Starting Task [phase].[task]: [Task Name]

**What I'll do:**
1. [Action 1]
2. [Action 2]
...

**Files I'll modify:**
- `path/to/file.ts`
...

**How I'll verify:**
- [Verification 1]
- [Verification 2]
```

## Step 4: Update Task Status

Update the task in PLAN.md to `Status: in_progress` and update STATE.md:

```markdown
## Current Task: [phase].[task] - [Task Name]
## Last Updated: [timestamp]
```

## Step 5: Execute Actions

Execute each action in the task sequentially:

1. **Before each file change**: Briefly explain what you're doing
2. **Make the change**: Use the appropriate tool (string_replace, write_file, etc.)
3. **Confirm success**: Verify the change was applied correctly

If an action fails:
- Do NOT continue to the next action
- Update task status to `blocked`
- Add a note explaining the blocker
- Ask the user how to proceed

## Step 6: Run Verification

After all actions complete, run each verification step:

1. **Run tests**: If verification includes test commands, execute them
2. **Check files**: Verify files exist and contain expected content
3. **Manual checks**: For things that can't be automated, ask the user to verify

If verification fails:
- Attempt to fix the issue (max 2 attempts)
- If still failing, mark task as `blocked` and explain

## Step 7: Complete Task

If all verifications pass:

1. **Update PLAN.md**: Set task status to `completed`
2. **Update STATE.md**:
   - Increment completed tasks count
   - Update current task to next pending task (or "Phase complete")
   - Add to session log: `[timestamp] Completed task [phase].[task]`

3. **Git commit** (if appropriate):
   ```
   git add -A && git commit -m "[YYYY-MM-DD] feat: [task description]"
   ```

   Only commit if:
   - The task made meaningful code changes
   - All verifications passed
   - Use descriptive commit message based on task

4. **Report completion**:
   ```
   ## Task [phase].[task] Complete

   **Changes made:**
   - [Summary of changes]

   **Verification results:**
   - [x] [Verification 1] - passed
   - [x] [Verification 2] - passed

   **Next:** Run `/gsd:next` to continue, or `/gsd:status` to see progress.
   ```

## Step 8: Offer Next Steps

After task completion, suggest:
- `/gsd:next` - Execute the next task
- `/gsd:status` - View overall progress
- `/gsd:plan` - Re-plan if tasks need adjustment

## Error Recovery

If something goes wrong:

1. **Recoverable error**: Fix it and continue
2. **Blocking error**:
   - Mark task as `blocked` in PLAN.md
   - Document the error in STATE.md session log
   - Ask user for guidance
3. **Critical failure**:
   - Suggest running `/checkpoint create` to save state
   - Recommend manual intervention

## Guidelines

- **One task at a time**: Complete current task fully before moving to next
- **Verify everything**: Never skip verification steps
- **Atomic commits**: One commit per completed task
- **Clear communication**: Always explain what you're doing and why
- **Fail fast**: If something is wrong, stop and ask rather than continuing
