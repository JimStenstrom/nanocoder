---
description: Initialize a structured workflow with planning documents
aliases: [gsd-init, workflow-init]
parameters: [project_name]
---

# Initialize Get-Shit-Done Workflow

You are initializing a structured workflow system to help the user systematically build their project. This system uses planning documents to maintain context and track progress.

## Step 1: Gather Project Information

Ask the user these questions one at a time (wait for each answer before asking the next):

1. **Project Name**: What should we call this project? (default: {{project_name}} or derive from directory name)
2. **Goal**: What are you trying to build or accomplish? Be specific about the end result.
3. **Key Features**: What are the 3-5 main features or components needed?
4. **Tech Stack**: What technologies, frameworks, or tools will be used?
5. **Constraints**: Any deadlines, limitations, or requirements to keep in mind?

## Step 2: Create Planning Documents

After gathering information, create the following files in `.nanocoder/gsd/`:

### `.nanocoder/gsd/PROJECT.md`
```markdown
# [Project Name]

## Goal
[User's stated goal]

## Key Features
- [Feature 1]
- [Feature 2]
- [Feature 3]

## Tech Stack
[Technologies and tools]

## Constraints
[Any limitations or requirements]

## Success Criteria
[How we know the project is complete]
```

### `.nanocoder/gsd/ROADMAP.md`
```markdown
# Roadmap

## Phase 1: [Foundation/Setup]
- [ ] Task 1.1
- [ ] Task 1.2

## Phase 2: [Core Feature]
- [ ] Task 2.1
- [ ] Task 2.2

## Phase 3: [Additional Features]
- [ ] Task 3.1

## Phase 4: [Polish/Testing]
- [ ] Task 4.1
```

### `.nanocoder/gsd/STATE.md`
```markdown
# Current State

## Status: INITIALIZED

## Current Phase: 1
## Current Task: None (run /gsd:plan to start)

## Progress
- Phases Completed: 0/N
- Tasks Completed: 0/N

## Last Updated: [timestamp]

## Session Log
- [timestamp] Workflow initialized
```

### `.nanocoder/gsd/PLAN.md`
```markdown
# Current Phase Plan

## Phase: Not Started

Run `/gsd:plan` to create the first phase plan with atomic tasks.

## Tasks
(none yet)
```

## Step 3: Confirm Creation

After creating the files, summarize:
1. The project structure created
2. The phases identified in the roadmap
3. Next step: Run `/gsd:plan` to create detailed tasks for Phase 1

## Important Guidelines

- Break the project into 3-5 phases maximum
- Each phase should be completable in a focused session
- Keep phases independent enough to checkpoint between them
- Tasks within a phase should be atomic (one clear action, one verification)
- Always ask clarifying questions if the goal is ambiguous
