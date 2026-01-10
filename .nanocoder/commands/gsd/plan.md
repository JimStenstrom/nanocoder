---
description: Create atomic tasks for the current phase
aliases: [gsd-plan, plan-phase]
---

# Plan Current Phase

You are creating a detailed execution plan for the current phase of the project. This plan breaks work into atomic, verifiable tasks.

## Step 1: Load Context

First, read the planning documents to understand the current state:

1. Read `.nanocoder/gsd/PROJECT.md` - Understand the overall goal
2. Read `.nanocoder/gsd/ROADMAP.md` - Find the current phase and its tasks
3. Read `.nanocoder/gsd/STATE.md` - Check current progress and phase number

If these files don't exist, tell the user to run `/gsd:init` first.

## Step 2: Identify Current Phase

From STATE.md, determine:
- Current phase number
- Any completed tasks in this phase
- The next task to plan

From ROADMAP.md, get:
- Phase name and description
- High-level tasks for this phase

## Step 3: Create Atomic Tasks

For each high-level task in the current phase, break it into 2-4 atomic sub-tasks. Each atomic task must have:

### Task Structure
```markdown
## Task [phase].[task]: [Short descriptive name]

**Status:** pending | in_progress | completed | blocked

**Description:**
[1-2 sentences describing what this task accomplishes]

**Actions:**
1. [Specific action 1 - e.g., "Create file `src/auth/login.ts`"]
2. [Specific action 2 - e.g., "Add login route to `src/routes/index.ts`"]
3. [Specific action 3]

**Verification:**
- [ ] [How to verify success - e.g., "File exists and exports `loginHandler`"]
- [ ] [Test command - e.g., "`pnpm run test:ava src/auth/login.spec.ts` passes"]
- [ ] [Manual check - e.g., "POST /api/login returns 200 with valid credentials"]

**Files to modify:**
- `path/to/file1.ts` - [what changes]
- `path/to/file2.ts` - [what changes]
```

## Step 4: Write PLAN.md

Update `.nanocoder/gsd/PLAN.md` with the atomic tasks:

```markdown
# Phase [N]: [Phase Name]

**Started:** [timestamp]
**Status:** in_progress

## Overview
[Brief description of what this phase accomplishes]

## Tasks

[Task 1 structure from above]

[Task 2 structure from above]

...

## Phase Completion Criteria
- [ ] All tasks completed
- [ ] All tests passing
- [ ] [Any phase-level verification]
```

## Step 5: Update STATE.md

Update `.nanocoder/gsd/STATE.md` to reflect:
- Current phase is now "in_progress"
- First task is ready to execute
- Last updated timestamp

## Step 6: Offer Execution Options

After planning, ask the user how they want to proceed:

1. **Review mode** (recommended for first time): "I can switch to plan mode so you can review each task before execution. Run `/gsd:next` to see what the first task will do without executing."

2. **Execute mode**: "Run `/gsd:next` to start executing the first task. I'll ask for confirmation before making changes."

3. **Auto mode**: "If you trust the plan, you can switch to auto-accept mode and run `/gsd:next` to execute tasks with minimal interruption."

## Guidelines

- Keep tasks small: Each task should take 1-5 tool calls to complete
- Be specific: Use exact file paths and function names
- Verify everything: Every task must have clear verification criteria
- One concern per task: Don't mix unrelated changes
- Order matters: Tasks should build on each other logically
- Include tests: If the project has tests, include running them as verification
