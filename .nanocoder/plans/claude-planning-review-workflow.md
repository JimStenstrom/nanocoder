# Claude Planning & Review Workflow

## Overview

Enable a hybrid workflow where Claude handles high-level planning and code review while a local LLM performs the actual code implementation. This leverages Claude's superior reasoning for architectural decisions and review while using cost-effective local models for coding tasks.

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Request                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: PLANNING (Claude)                           │
│  - Analyze request and codebase                                         │
│  - Break down into structured tasks                                     │
│  - Define acceptance criteria per task                                  │
│  - Specify files to modify and approach                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: IMPLEMENTATION (Local LLM)                  │
│  - Execute tasks sequentially                                           │
│  - Use tools (read/write/execute)                                       │
│  - Create checkpoint after each task                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: REVIEW (Claude)                             │
│  - Review all changes against original request                          │
│  - Check acceptance criteria                                            │
│  - Provide feedback/corrections                                         │
│  - Approve or request revisions                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
                   [Approved]              [Revisions]
                        │                       │
                        ▼                       ▼
                   Complete              Back to Phase 2
```

## Implementation Plan

### Step 1: Extend Configuration Schema

**File: `source/types/config.ts`**

Add workflow configuration types:

```typescript
// Add to AppConfig interface
export interface WorkflowConfig {
  planningModel: {
    provider: string;
    model: string;
  };
  codingModel: {
    provider: string;
    model: string;
  };
  reviewModel: {
    provider: string;
    model: string;
  };
  // Whether to auto-proceed between phases
  autoAdvance?: boolean;
  // Maximum revision cycles before human intervention
  maxRevisions?: number;
}

// Extended AppConfig
export interface AppConfig {
  // ... existing fields ...
  workflow?: WorkflowConfig;
}
```

**File: `agents.config.json`** - Example configuration:

```json
{
  "nanocoder": {
    "providers": [...],
    "workflow": {
      "planningModel": {
        "provider": "OpenRouter",
        "model": "anthropic/claude-sonnet-4"
      },
      "codingModel": {
        "provider": "LocalLLM",
        "model": "qwen2.5-coder:32b"
      },
      "reviewModel": {
        "provider": "OpenRouter",
        "model": "anthropic/claude-sonnet-4"
      },
      "autoAdvance": false,
      "maxRevisions": 3
    }
  }
}
```

### Step 2: Create Task/Plan Data Structures

**File: `source/types/workflow.ts`** (new)

```typescript
export type WorkflowPhase = 'planning' | 'implementing' | 'reviewing' | 'complete';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'needs_revision';

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  targetFiles: string[];
  approach: string;
  dependencies: string[]; // IDs of tasks that must complete first
  status: TaskStatus;
  result?: {
    filesModified: string[];
    summary: string;
    issues?: string[];
  };
}

export interface ExecutionPlan {
  id: string;
  originalRequest: string;
  createdAt: number;
  phase: WorkflowPhase;
  tasks: TaskDefinition[];
  context: {
    relevantFiles: string[];
    codebaseNotes: string;
  };
  revisionHistory: RevisionEntry[];
}

export interface RevisionEntry {
  timestamp: number;
  reviewFeedback: string;
  tasksAffected: string[];
  resolved: boolean;
}
```

### Step 3: Implement Workflow Manager

**File: `source/services/workflow-manager.ts`** (new)

Core orchestration logic:

```typescript
export class WorkflowManager {
  private currentPlan: ExecutionPlan | null = null;
  private plannerClient: LLMClient;
  private coderClient: LLMClient;
  private reviewerClient: LLMClient;

  constructor(config: WorkflowConfig, providers: Map<string, LLMClient>) {
    // Initialize clients for each phase
  }

  async startWorkflow(userRequest: string): Promise<void> {
    // 1. Create plan using planner client
    // 2. Store plan
    // 3. Transition to implementation phase
  }

  async executeNextTask(): Promise<TaskDefinition | null> {
    // Get next pending task
    // Execute with coder client
    // Update task status
    // Create checkpoint
  }

  async requestReview(): Promise<ReviewResult> {
    // Gather all changes
    // Submit to reviewer client
    // Parse feedback
    // Update plan accordingly
  }

  getCurrentPhase(): WorkflowPhase { ... }
  getPlan(): ExecutionPlan | null { ... }
  getTaskProgress(): { completed: number; total: number } { ... }
}
```

### Step 4: Create Phase-Specific Prompts

**File: `source/app/prompts/planning-prompt.md`** (new)

```markdown
You are a senior software architect analyzing a coding task. Your role is to:

1. Understand the user's request fully
2. Explore the codebase to understand existing patterns
3. Break the work into discrete, well-defined tasks
4. Define clear acceptance criteria for each task

## Output Format

You must output a structured plan in this exact JSON format:

{
  "tasks": [
    {
      "id": "task-1",
      "title": "Short descriptive title",
      "description": "Detailed description of what needs to be done",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "targetFiles": ["path/to/file1.ts", "path/to/file2.ts"],
      "approach": "How to implement this task",
      "dependencies": []
    }
  ],
  "context": {
    "relevantFiles": ["files reviewed"],
    "codebaseNotes": "Important patterns/conventions observed"
  }
}

## Guidelines
- Keep tasks atomic and independently testable
- Order tasks by dependencies (implement foundations first)
- Be specific about files and locations
- Include edge cases in acceptance criteria
```

**File: `source/app/prompts/coding-prompt.md`** (new)

```markdown
You are implementing a specific coding task. Follow these instructions exactly:

## Current Task
{{TASK_JSON}}

## Context
{{CODEBASE_NOTES}}

## Instructions
1. Read the target files first
2. Make the changes described in the task
3. Verify your changes meet acceptance criteria
4. Report what you changed

Do NOT:
- Deviate from the task scope
- Make "improvements" not in the task
- Skip any acceptance criteria
```

**File: `source/app/prompts/review-prompt.md`** (new)

```markdown
You are reviewing code changes made by another developer.

## Original Request
{{ORIGINAL_REQUEST}}

## Execution Plan
{{PLAN_JSON}}

## Changes Made
{{GIT_DIFF}}

## Your Role
1. Verify all acceptance criteria are met
2. Check for bugs, security issues, or quality problems
3. Ensure changes align with the original request
4. Provide specific, actionable feedback

## Output Format
{
  "approved": true/false,
  "overallFeedback": "Summary of review",
  "taskFeedback": [
    {
      "taskId": "task-1",
      "passed": true/false,
      "issues": ["Issue 1"],
      "suggestions": ["Suggestion 1"]
    }
  ],
  "criticalIssues": ["Any blocking issues"],
  "revisionTasks": [
    // New task definitions for any fixes needed
  ]
}
```

### Step 5: Implement Client Switching

**File: `source/ai-sdk-client/multi-client-manager.ts`** (new)

```typescript
export class MultiClientManager {
  private clients: Map<string, LLMClient> = new Map();
  private activeClientKey: string | null = null;

  async initializeClient(key: string, providerConfig: AIProviderConfig): Promise<void> {
    const client = await AISDKClient.create(providerConfig);
    this.clients.set(key, client);
  }

  switchTo(key: string): LLMClient {
    const client = this.clients.get(key);
    if (!client) throw new Error(`Client '${key}' not initialized`);
    this.activeClientKey = key;
    return client;
  }

  getActive(): LLMClient | null {
    return this.activeClientKey ? this.clients.get(this.activeClientKey) || null : null;
  }

  getClient(key: string): LLMClient | null {
    return this.clients.get(key) || null;
  }
}
```

### Step 6: Extend Development Mode

**File: `source/types/core.ts`**

Add new workflow mode:

```typescript
export type DevelopmentMode = 'normal' | 'auto-accept' | 'plan' | 'workflow';
```

**File: `source/context/workflow-context.ts`** (new)

```typescript
import type { WorkflowPhase, ExecutionPlan } from '@/types/workflow';

let currentWorkflowPhase: WorkflowPhase | null = null;
let currentPlan: ExecutionPlan | null = null;

export function setWorkflowPhase(phase: WorkflowPhase | null): void {
  currentWorkflowPhase = phase;
}

export function getWorkflowPhase(): WorkflowPhase | null {
  return currentWorkflowPhase;
}

export function setCurrentPlan(plan: ExecutionPlan | null): void {
  currentPlan = plan;
}

export function getCurrentPlan(): ExecutionPlan | null {
  return currentPlan;
}
```

### Step 7: Create Workflow UI Components

**File: `source/components/workflow/workflow-status.tsx`** (new)

Display current workflow phase and progress:

```tsx
export function WorkflowStatus({ plan, phase }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold>Workflow: {phase}</Text>
      <Box marginLeft={2}>
        <Text>Tasks: {completedCount}/{totalCount}</Text>
        <ProgressBar progress={completedCount / totalCount} />
      </Box>
      {/* Current task details */}
    </Box>
  );
}
```

**File: `source/components/workflow/phase-transition.tsx`** (new)

Prompt user between phases:

```tsx
export function PhaseTransition({ fromPhase, toPhase, onProceed, onCancel }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Phase Complete: {fromPhase}</Text>
      <Text>Ready to proceed to: {toPhase}</Text>
      <Box marginTop={1}>
        <Text>[Enter] Proceed  [Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
```

**File: `source/components/workflow/review-display.tsx`** (new)

Show review results:

```tsx
export function ReviewDisplay({ review }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold color={review.approved ? 'green' : 'yellow'}>
        {review.approved ? '✓ Approved' : '⟳ Revisions Needed'}
      </Text>
      {review.taskFeedback.map(feedback => (
        <TaskFeedback key={feedback.taskId} {...feedback} />
      ))}
    </Box>
  );
}
```

### Step 8: Add CLI Command for Workflow Mode

**File: `source/commands/workflow.tsx`** (new)

```tsx
export const workflowCommand: Command = {
  name: '/workflow',
  description: 'Start or manage the planning/coding/review workflow',
  execute: async (args, context) => {
    const subcommand = args[0];

    switch (subcommand) {
      case 'start':
        // Initialize workflow mode
        break;
      case 'status':
        // Show current workflow status
        break;
      case 'proceed':
        // Move to next phase
        break;
      case 'abort':
        // Cancel workflow
        break;
    }
  },
};
```

### Step 9: Integrate with Chat Handler

**File: `source/hooks/chat-handler/workflow-handler.ts`** (new)

Handle workflow-specific message routing:

```typescript
export function useWorkflowHandler({
  workflowManager,
  onPhaseComplete,
  ...props
}: WorkflowHandlerProps) {

  const handleWorkflowMessage = async (message: string) => {
    const phase = workflowManager.getCurrentPhase();

    switch (phase) {
      case 'planning':
        await handlePlanningPhase(message);
        break;
      case 'implementing':
        await handleImplementingPhase();
        break;
      case 'reviewing':
        await handleReviewingPhase();
        break;
    }
  };

  return { handleWorkflowMessage };
}
```

### Step 10: Persist Workflow State

**File: `source/services/workflow-persistence.ts`** (new)

Save/load workflow state for resumption:

```typescript
const WORKFLOW_DIR = '.nanocoder/workflows';

export async function saveWorkflowState(plan: ExecutionPlan): Promise<void> {
  const filepath = path.join(WORKFLOW_DIR, `${plan.id}.json`);
  await fs.writeFile(filepath, JSON.stringify(plan, null, 2));
}

export async function loadWorkflowState(planId: string): Promise<ExecutionPlan | null> {
  const filepath = path.join(WORKFLOW_DIR, `${planId}.json`);
  if (!await fs.exists(filepath)) return null;
  return JSON.parse(await fs.readFile(filepath, 'utf-8'));
}

export async function listActiveWorkflows(): Promise<ExecutionPlan[]> {
  // List incomplete workflows
}
```

## File Summary

### New Files (12)

| File | Purpose |
|------|---------|
| `source/types/workflow.ts` | Workflow type definitions |
| `source/services/workflow-manager.ts` | Core workflow orchestration |
| `source/services/workflow-persistence.ts` | Save/load workflow state |
| `source/ai-sdk-client/multi-client-manager.ts` | Manage multiple LLM clients |
| `source/context/workflow-context.ts` | Global workflow state |
| `source/app/prompts/planning-prompt.md` | Planning phase prompt |
| `source/app/prompts/coding-prompt.md` | Coding phase prompt |
| `source/app/prompts/review-prompt.md` | Review phase prompt |
| `source/components/workflow/workflow-status.tsx` | Status display |
| `source/components/workflow/phase-transition.tsx` | Phase transition UI |
| `source/components/workflow/review-display.tsx` | Review results display |
| `source/commands/workflow.tsx` | /workflow command |
| `source/hooks/chat-handler/workflow-handler.ts` | Workflow message handling |

### Modified Files (5)

| File | Changes |
|------|---------|
| `source/types/config.ts` | Add WorkflowConfig interface |
| `source/types/core.ts` | Add 'workflow' to DevelopmentMode |
| `source/app/App.tsx` | Integrate workflow components |
| `source/hooks/useAppState.ts` | Add workflow state |
| `source/config/index.ts` | Load workflow config |

## Implementation Order

1. **Types First**: `types/workflow.ts`, update `types/config.ts`, `types/core.ts`
2. **Core Services**: `multi-client-manager.ts`, `workflow-manager.ts`, `workflow-persistence.ts`
3. **Context**: `workflow-context.ts`
4. **Prompts**: All three prompt files
5. **UI Components**: All workflow components
6. **Integration**: Command, handler, App.tsx updates
7. **Testing**: Unit tests for workflow manager, integration tests

## Testing Strategy

1. **Unit Tests**
   - WorkflowManager state transitions
   - Task dependency resolution
   - Plan parsing/validation

2. **Integration Tests**
   - Full workflow with mock clients
   - Client switching
   - State persistence/recovery

3. **Manual Testing**
   - Real Claude + local LLM workflow
   - Phase transitions
   - Error recovery

## Open Questions for User

1. **Review granularity**: Should Claude review after each task or only after all tasks complete?
2. **Revision limits**: What happens after max revisions? Abort or escalate to user?
3. **Checkpoint strategy**: Create checkpoints per-task or per-phase?
4. **Parallel tasks**: Should tasks without dependencies execute in parallel?
5. **Manual override**: Should user be able to skip phases or manually edit the plan?
