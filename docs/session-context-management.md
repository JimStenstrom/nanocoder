# Session & Context Management System

> Design document for local LLM session persistence and intelligent context building.
>
> **Issue Reference:** #51 (/resume feature)
> **Status:** Draft
> **Authors:** Design session 2025-12-25

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Phase 1: Session Storage](#phase-1-session-storage)
4. [Phase 2: Context Builder](#phase-2-context-builder)
5. [Phase 3: Compaction Strategies](#phase-3-compaction-strategies)
6. [Phase 4: Commands & Resume](#phase-4-commands--resume)
7. [Phase 5: Auto-Persistence](#phase-5-auto-persistence)
8. [Data Schemas](#data-schemas)
9. [Migration & Compatibility](#migration--compatibility)

---

## Overview

### Problem Statement

1. **Conversations are ephemeral** - Messages are lost on exit unless manually checkpointed
2. **Local LLMs have small context windows** - 4K-32K tokens vs 100K+ for cloud models
3. **No session resume** - Users cannot continue previous conversations
4. **Context management is manual** - Users must `/clear` when hitting limits

### Solution

Separate **storage** from **context building**:

- **Session Storage**: Record everything verbatim in append-only files
- **Context Builder**: Reconstruct optimized context for each LLM call

Since LLM inference is stateless, each call is independent. We can build whatever context fits the model's window while preserving the complete history in session files.

### Key Insight

> The LLM only knows what's in the current context window. We don't need to preserve the **conversation** - we need to preserve the **state**. The conversation is just a log of how we arrived at the state.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SESSION FILES                            │
│                    (Verbatim, append-only)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ messages.jsonl - Every message exactly as it happened       ││
│  │ tools.jsonl - Every tool call with full input/output        ││
│  │ metadata.json - Session info, provider, timestamps          ││
│  │ summaries/ - Cached summaries for fast context building     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Read (on every LLM call)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONTEXT BUILDER                             │
│              (Stateless, rebuilds every call)                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 1. Calculate token budget for this model                    ││
│  │ 2. Select appropriate compaction strategy                   ││
│  │ 3. Build optimized message array                            ││
│  │ 4. Return context that fits within budget                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Optimized context
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LLM CALL                                 │
│                    (Stateless inference)                         │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Storage is sacred** - Never lose user data, always append-only
2. **Context is ephemeral** - Rebuilt fresh for every call
3. **Strategies are pluggable** - Easy to add new compaction approaches
4. **Transparency** - User can see what context was sent (`/debug context`)
5. **Graceful degradation** - Always fall back to minimal context if needed

---

## Phase 1: Session Storage

**Goal:** Implement verbatim session recording with no context management yet.

### Directory Structure

```
~/.nanocoder/
├── sessions/
│   ├── index.jsonl                    # Global session index (fast lookup)
│   └── projects/
│       └── <project-hash>/
│           ├── session-<id>/
│           │   ├── metadata.json
│           │   ├── messages.jsonl
│           │   ├── tools.jsonl
│           │   └── summaries/
│           │       └── <range-hash>.json
│           └── session-<id>/
│               └── ...

.nanocoder/
└── current-session -> ~/.nanocoder/sessions/projects/<hash>/session-<id>
```

### Files to Create

```
source/sessions/
├── index.ts                 # Public API exports
├── types.ts                 # All type definitions
├── session-manager.ts       # Create, list, delete, load sessions
├── session-storage.ts       # Read/write session files (JSONL)
├── session-id.ts            # ID generation and validation
└── project-hash.ts          # Consistent project path hashing
```

### Key Types

```typescript
// source/sessions/types.ts

export interface SessionMetadata {
  id: string;
  version: number;              // Schema version for migrations

  // Project binding
  projectPath: string;
  projectHash: string;

  // Timestamps
  createdAt: string;
  lastAccessedAt: string;

  // Content summary (updated on write)
  title: string;
  messageCount: number;
  totalTokens: number;

  // Provider info
  provider: {
    type: 'ollama' | 'llamacpp' | 'lmstudio' | 'openai' | 'anthropic' | 'openai-compatible';
    model: string;
    contextWindow: number;
    baseUrl?: string;
  };

  // State
  status: 'active' | 'archived' | 'corrupted';
}

export interface StoredMessage {
  id: string;
  parentId: string | null;       // For future: branching conversations
  timestamp: string;

  // Core message
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;

  // Token tracking
  tokenCount: number;
  cumulativeTokens: number;

  // Tool-specific
  toolCallId?: string;
  toolName?: string;

  // Assistant-specific
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface StoredToolExecution {
  id: string;
  timestamp: string;
  messageId: string;            // Links to assistant message that called it

  tool: string;
  args: Record<string, unknown>;

  result: {
    success: boolean;
    content: string;
    error?: string;
  };

  // Metrics
  resultTokens: number;
  durationMs: number;
}
```

### Public API

```typescript
// source/sessions/session-manager.ts

export class SessionManager {
  // Lifecycle
  async createSession(projectPath: string, provider: ProviderInfo): Promise<Session>;
  async loadSession(sessionId: string): Promise<Session>;
  async getCurrentSession(projectPath: string): Promise<Session | null>;

  // Discovery
  async listSessions(projectPath?: string): Promise<SessionMetadata[]>;
  async getSession(sessionId: string): Promise<SessionMetadata | null>;

  // Management
  async archiveSession(sessionId: string): Promise<void>;
  async deleteSession(sessionId: string): Promise<void>;
  async setCurrentSession(projectPath: string, sessionId: string): Promise<void>;
}

export class Session {
  readonly id: string;
  readonly metadata: SessionMetadata;

  // Write (append-only)
  async appendMessage(message: Message): Promise<StoredMessage>;
  async appendToolExecution(call: ToolCall, result: ToolResult): Promise<StoredToolExecution>;
  async updateMetadata(updates: Partial<SessionMetadata>): Promise<void>;

  // Read
  async getMessages(): Promise<StoredMessage[]>;
  async getToolExecutions(): Promise<StoredToolExecution[]>;
  async getMessageCount(): Promise<number>;
  async getTotalTokens(): Promise<number>;

  // Utilities
  async export(format: 'json' | 'markdown'): Promise<string>;
}
```

### Deliverables

- [ ] `SessionManager` class with create/list/load/delete
- [ ] `Session` class with append-only message recording
- [ ] JSONL file I/O utilities
- [ ] Project path hashing (consistent across runs)
- [ ] Global session index for fast listing
- [ ] Unit tests for all storage operations

---

## Phase 2: Context Builder

**Goal:** Build optimized context for each LLM call based on token budget.

### Files to Create

```
source/sessions/context/
├── index.ts                 # Public API
├── context-builder.ts       # Main orchestrator
├── context-budget.ts        # Token budget calculation
├── strategy-registry.ts     # Strategy management
└── types.ts                 # Context-specific types
```

### Context Budget Calculation

```typescript
// source/sessions/context/context-budget.ts

export interface ContextBudget {
  // Model limits
  modelContextWindow: number;

  // Fixed allocations
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  reserveForResponse: number;

  // Available for conversation
  availableTokens: number;

  // Current usage
  currentConversationTokens: number;
  utilizationPercent: number;
}

export function calculateBudget(
  modelContextWindow: number,
  systemPrompt: string,
  toolDefinitions: string,
  tokenizer: Tokenizer
): ContextBudget {
  const systemTokens = tokenizer.count(systemPrompt);
  const toolTokens = tokenizer.count(toolDefinitions);
  const reserveForResponse = Math.floor(modelContextWindow * 0.25);

  const available = modelContextWindow - systemTokens - toolTokens - reserveForResponse;

  return {
    modelContextWindow,
    systemPromptTokens: systemTokens,
    toolDefinitionTokens: toolTokens,
    reserveForResponse,
    availableTokens: Math.max(0, available),
    currentConversationTokens: 0,
    utilizationPercent: 0
  };
}
```

### Context Builder

```typescript
// source/sessions/context/context-builder.ts

export interface ContextBuildResult {
  messages: Message[];
  strategy: string;
  tokensUsed: number;
  tokenBudget: number;

  // Debugging info
  originalMessageCount: number;
  includedMessageCount: number;
  summarizedMessageCount: number;
}

export class ContextBuilder {
  private strategies: ContextStrategy[];
  private tokenizer: Tokenizer;

  constructor(tokenizer: Tokenizer) {
    this.tokenizer = tokenizer;
    this.strategies = [];
  }

  registerStrategy(strategy: ContextStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  async buildContext(
    session: Session,
    budget: ContextBudget
  ): Promise<ContextBuildResult> {
    const allMessages = await session.getMessages();
    const totalTokens = await session.getTotalTokens();

    // If everything fits, use full history
    if (totalTokens <= budget.availableTokens) {
      return {
        messages: allMessages,
        strategy: 'full-history',
        tokensUsed: totalTokens,
        tokenBudget: budget.availableTokens,
        originalMessageCount: allMessages.length,
        includedMessageCount: allMessages.length,
        summarizedMessageCount: 0
      };
    }

    // Try strategies until one fits
    for (const strategy of this.strategies) {
      if (budget.availableTokens < strategy.minTokens) {
        continue;
      }

      const result = await strategy.build(session, budget.availableTokens, this.tokenizer);
      const tokensUsed = this.tokenizer.countMessages(result.messages);

      if (tokensUsed <= budget.availableTokens) {
        return {
          messages: result.messages,
          strategy: strategy.name,
          tokensUsed,
          tokenBudget: budget.availableTokens,
          originalMessageCount: allMessages.length,
          includedMessageCount: result.includedCount,
          summarizedMessageCount: result.summarizedCount
        };
      }
    }

    // Fallback: minimal context always works
    return this.buildMinimalContext(session, budget);
  }
}
```

### Strategy Interface

```typescript
// source/sessions/context/types.ts

export interface ContextStrategy {
  name: string;
  priority: number;        // Lower = try first
  minTokens: number;       // Minimum tokens this strategy needs

  build(
    session: Session,
    budgetTokens: number,
    tokenizer: Tokenizer
  ): Promise<StrategyResult>;
}

export interface StrategyResult {
  messages: Message[];
  includedCount: number;
  summarizedCount: number;
}
```

### Deliverables

- [ ] `ContextBuilder` class with strategy selection
- [ ] `ContextBudget` calculation
- [ ] Strategy interface and registry
- [ ] Integration point with chat handler
- [ ] `/debug context` command to show what was sent
- [ ] Unit tests for budget calculation

---

## Phase 3: Compaction Strategies

**Goal:** Implement pluggable strategies for fitting conversation into context window.

### Files to Create

```
source/sessions/context/strategies/
├── index.ts                 # Export all strategies
├── full-history.ts          # Strategy 1: Use everything
├── pruned-tools.ts          # Strategy 2: Compress tool results
├── recent-plus-summary.ts   # Strategy 3: Summarize old messages
├── minimal-state.ts         # Strategy 4: Just state + last message
└── summarizer.ts            # LLM-based summarization utility
```

### Strategy 1: Full History

```typescript
// source/sessions/context/strategies/full-history.ts

export const fullHistoryStrategy: ContextStrategy = {
  name: 'full-history',
  priority: 1,
  minTokens: 0,

  async build(session, budgetTokens, tokenizer): Promise<StrategyResult> {
    const messages = await session.getMessages();
    return {
      messages: messages.map(toMessage),
      includedCount: messages.length,
      summarizedCount: 0
    };
  }
};
```

### Strategy 2: Pruned Tools

Compress old tool results while keeping recent ones verbatim.

```typescript
// source/sessions/context/strategies/pruned-tools.ts

const RECENT_MESSAGE_COUNT = 6;  // Keep last 3 exchanges verbatim

export const prunedToolsStrategy: ContextStrategy = {
  name: 'pruned-tools',
  priority: 2,
  minTokens: 2000,

  async build(session, budgetTokens, tokenizer): Promise<StrategyResult> {
    const messages = await session.getMessages();

    const processed = messages.map((msg, i) => {
      const isRecent = i >= messages.length - RECENT_MESSAGE_COUNT;

      if (msg.role === 'tool' && !isRecent) {
        return {
          ...msg,
          content: pruneToolResult(msg.content, msg.toolName)
        };
      }

      return msg;
    });

    return {
      messages: processed.map(toMessage),
      includedCount: messages.length,
      summarizedCount: 0
    };
  }
};

function pruneToolResult(content: string, toolName?: string): string {
  const lines = content.split('\n').length;
  const chars = content.length;

  switch (toolName) {
    case 'Read':
    case 'read_file':
      // Keep first/last few lines as preview
      const fileLines = content.split('\n');
      if (fileLines.length > 20) {
        const preview = [
          ...fileLines.slice(0, 10),
          `\n... [${fileLines.length - 20} lines omitted] ...\n`,
          ...fileLines.slice(-10)
        ].join('\n');
        return `[File: ${lines} lines]\n${preview}`;
      }
      return content;

    case 'Bash':
    case 'execute_bash':
      if (chars > 1000) {
        return `[Command output: ${chars} chars]\n${content.slice(0, 400)}\n...\n${content.slice(-400)}`;
      }
      return content;

    case 'Grep':
    case 'search':
      const matches = (content.match(/\n/g) || []).length + 1;
      if (chars > 800) {
        return `[Search: ${matches} results]\n${content.slice(0, 600)}...`;
      }
      return content;

    default:
      if (chars > 800) {
        return `[Tool output: ${chars} chars]\n${content.slice(0, 600)}...`;
      }
      return content;
  }
}
```

### Strategy 3: Recent Plus Summary

Summarize older messages, keep recent ones verbatim.

```typescript
// source/sessions/context/strategies/recent-plus-summary.ts

const RECENT_MESSAGE_COUNT = 6;
const SUMMARY_TARGET_RATIO = 0.3;  // Summary should be ~30% of budget

export const recentPlusSummaryStrategy: ContextStrategy = {
  name: 'recent-plus-summary',
  priority: 3,
  minTokens: 1500,

  async build(session, budgetTokens, tokenizer): Promise<StrategyResult> {
    const messages = await session.getMessages();

    if (messages.length <= RECENT_MESSAGE_COUNT) {
      return {
        messages: messages.map(toMessage),
        includedCount: messages.length,
        summarizedCount: 0
      };
    }

    const recentMessages = messages.slice(-RECENT_MESSAGE_COUNT);
    const olderMessages = messages.slice(0, -RECENT_MESSAGE_COUNT);

    const recentTokens = tokenizer.countMessages(recentMessages.map(toMessage));
    const summaryBudget = Math.floor((budgetTokens - recentTokens) * 0.9);

    // Get or generate summary
    const summary = await session.getSummaryForRange(
      olderMessages[0].id,
      olderMessages[olderMessages.length - 1].id,
      summaryBudget
    );

    return {
      messages: [
        {
          role: 'system',
          content: `## Prior Conversation Summary\n\n${summary}\n\n---\n\n## Recent Messages Follow`
        },
        ...recentMessages.map(toMessage)
      ],
      includedCount: recentMessages.length,
      summarizedCount: olderMessages.length
    };
  }
};
```

### Strategy 4: Minimal State

Extract just the essential state for maximum compression.

```typescript
// source/sessions/context/strategies/minimal-state.ts

export const minimalStateStrategy: ContextStrategy = {
  name: 'minimal-state',
  priority: 4,
  minTokens: 400,

  async build(session, budgetTokens, tokenizer): Promise<StrategyResult> {
    const messages = await session.getMessages();
    const state = await extractSessionState(session);
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    const stateContext = formatStateContext(state);

    return {
      messages: [
        { role: 'system', content: stateContext },
        { role: 'user', content: lastUserMessage?.content || '' }
      ],
      includedCount: 1,
      summarizedCount: messages.length - 1
    };
  }
};

interface SessionState {
  projectPath: string;
  originalTask: string;
  modifiedFiles: Array<{ path: string; action: 'created' | 'modified' | 'deleted' }>;
  currentStatus: string;
  blockers: string[];
  keyDecisions: string[];
}

function formatStateContext(state: SessionState): string {
  return `You are continuing a coding session.

PROJECT: ${state.projectPath}

ORIGINAL TASK: ${state.originalTask}

FILES MODIFIED THIS SESSION:
${state.modifiedFiles.map(f => `- ${f.path} (${f.action})`).join('\n') || '- None yet'}

CURRENT STATUS: ${state.currentStatus}

${state.keyDecisions.length ? `KEY DECISIONS MADE:\n${state.keyDecisions.map(d => `- ${d}`).join('\n')}` : ''}

${state.blockers.length ? `CURRENT BLOCKERS:\n${state.blockers.map(b => `- ${b}`).join('\n')}` : ''}

Continue assisting with the user's request below.`;
}
```

### Summarization Utility

```typescript
// source/sessions/context/strategies/summarizer.ts

const SUMMARIZATION_SYSTEM_PROMPT = `You are summarizing a coding conversation for context continuity.
The summary will be injected into a future conversation so the AI can continue helping.

PRESERVE in your summary:
- The original task/goal the user requested
- Key technical decisions and their rationale
- Files that were created, modified, or deleted
- Current state of the work (what's done, what's pending)
- Any errors encountered and how they were resolved
- Important constraints or preferences the user mentioned

DO NOT include:
- Greetings, pleasantries, or filler
- Full file contents (just note what files were involved)
- Detailed tool outputs (just outcomes)
- Redundant information

Write as a concise narrative paragraph, not bullet points.`;

export async function generateSummary(
  messages: StoredMessage[],
  targetTokens: number,
  summarizer: LLMClient
): Promise<string> {
  const conversation = formatMessagesForSummary(messages);

  const response = await summarizer.complete({
    messages: [
      { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
      { role: 'user', content: `Target length: approximately ${targetTokens} tokens.\n\nCONVERSATION TO SUMMARIZE:\n\n${conversation}` }
    ],
    maxTokens: targetTokens + 100  // Small buffer
  });

  return response.content;
}

function formatMessagesForSummary(messages: StoredMessage[]): string {
  return messages.map(m => {
    const role = m.role.toUpperCase();
    const content = m.role === 'tool'
      ? `[Tool ${m.toolName}: ${m.content.slice(0, 200)}...]`
      : m.content;
    return `${role}: ${content}`;
  }).join('\n\n');
}
```

### Deliverables

- [ ] Full history strategy (baseline)
- [ ] Pruned tools strategy with smart truncation
- [ ] Recent plus summary strategy
- [ ] Minimal state strategy
- [ ] Summarization utility with caching
- [ ] State extraction from session
- [ ] Unit tests for each strategy

---

## Phase 4: Commands & Resume

**Goal:** Add user-facing commands for session management and resume.

### CLI Flags

```bash
# Continue last session in this project
nanocoder --continue
nanocoder -c

# Resume specific session by ID
nanocoder --resume abc123
nanocoder -r abc123

# Show session picker
nanocoder --resume
nanocoder -r

# Start fresh (ignore existing session)
nanocoder --new
nanocoder -n
```

### In-Session Commands

```
/sessions                    # List sessions for this project
/sessions all                # List all sessions across projects
/session info                # Show current session details
/session export [file]       # Export as markdown
/session archive             # Archive current session
/compact                     # Manual compaction (show what would happen)
/compact --apply             # Apply compaction
/debug context               # Show what context was sent to LLM
```

### Files to Create

```
source/commands/
├── sessions.tsx             # /sessions command
├── session.tsx              # /session subcommands
├── compact.tsx              # /compact command
└── debug-context.tsx        # /debug context command

source/components/
└── SessionPicker.tsx        # Interactive session selector
```

### Session Picker UI

```
┌─────────────────────────────────────────────────────────────┐
│ Select a session to resume:                                 │
├─────────────────────────────────────────────────────────────┤
│ ▸ Today 2:30 PM    "Implement auth system"     45 messages │
│   Today 10:15 AM   "Fix CORS issues"           12 messages │
│   Yesterday        "Add user registration"     78 messages │
│   Dec 23           "Database migrations"       23 messages │
├─────────────────────────────────────────────────────────────┤
│ [Enter] Resume  [n] New session  [q] Quit                  │
└─────────────────────────────────────────────────────────────┘
```

### Deliverables

- [ ] `--continue` / `-c` flag handling in CLI
- [ ] `--resume` / `-r` flag with optional session ID
- [ ] `--new` / `-n` flag to start fresh
- [ ] `/sessions` command to list sessions
- [ ] `/session info|export|archive` subcommands
- [ ] `/compact` command with dry-run and apply modes
- [ ] `/debug context` command
- [ ] `SessionPicker` component for interactive selection
- [ ] Integration with app initialization flow

---

## Phase 5: Auto-Persistence

**Goal:** Automatically persist sessions without user intervention.

### Auto-Save Behavior

```typescript
// source/sessions/auto-persist.ts

export interface AutoPersistConfig {
  enabled: boolean;

  // When to save
  saveAfterAssistantMessage: boolean;
  saveAfterToolExecution: boolean;
  debounceMs: number;                    // Debounce rapid saves

  // Metadata updates
  updateMetadataIntervalMs: number;      // Update token counts, etc.

  // Cleanup
  maxSessionsPerProject: number;         // Auto-archive old sessions
  autoArchiveAfterDays: number;          // Archive inactive sessions
}

const DEFAULT_CONFIG: AutoPersistConfig = {
  enabled: true,
  saveAfterAssistantMessage: true,
  saveAfterToolExecution: true,
  debounceMs: 1000,
  updateMetadataIntervalMs: 5000,
  maxSessionsPerProject: 50,
  autoArchiveAfterDays: 30
};
```

### Integration with Chat Handler

```typescript
// Pseudocode for chat handler integration

async function handleUserMessage(content: string) {
  // 1. Append to session (immediate, crash-safe)
  await session.appendMessage({ role: 'user', content });

  // 2. Build context for LLM call
  const context = await contextBuilder.buildContext(session, budget);

  // 3. Call LLM
  const response = await llm.chat({ messages: context.messages });

  // 4. Append response to session
  await session.appendMessage({ role: 'assistant', content: response.content });

  // 5. Handle tool calls
  for (const toolCall of response.toolCalls) {
    const result = await executeTool(toolCall);
    await session.appendToolExecution(toolCall, result);
  }

  // 6. Schedule metadata update (debounced)
  autoPersist.scheduleMetadataUpdate();
}
```

### Graceful Shutdown

```typescript
// Ensure session is properly closed on exit

process.on('SIGTERM', async () => {
  await session.updateMetadata({
    lastAccessedAt: new Date().toISOString()
  });
  await session.flush();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await session.updateMetadata({
    lastAccessedAt: new Date().toISOString()
  });
  await session.flush();
  process.exit(0);
});
```

### Deliverables

- [ ] `AutoPersist` class with debounced saving
- [ ] Integration with chat handler
- [ ] Graceful shutdown handlers
- [ ] Session cleanup/archival logic
- [ ] Configuration options in settings
- [ ] Crash recovery (detect incomplete sessions)

---

## Data Schemas

### Session Index (Global)

```typescript
// ~/.nanocoder/sessions/index.jsonl
// One line per session, for fast scanning

interface SessionIndexEntry {
  id: string;
  projectPath: string;
  projectHash: string;
  title: string;
  createdAt: string;
  lastAccessedAt: string;
  messageCount: number;
  status: 'active' | 'archived';
}
```

### Session Metadata

```typescript
// ~/.nanocoder/sessions/projects/<hash>/session-<id>/metadata.json

interface SessionMetadata {
  version: 1;
  id: string;

  project: {
    path: string;
    hash: string;
    name: string;           // Extracted from path or package.json
  };

  timestamps: {
    createdAt: string;
    lastAccessedAt: string;
    lastMessageAt: string;
  };

  stats: {
    messageCount: number;
    toolExecutionCount: number;
    totalTokens: number;
    userMessageCount: number;
    assistantMessageCount: number;
  };

  provider: {
    type: string;
    model: string;
    contextWindow: number;
    baseUrl?: string;
  };

  display: {
    title: string;          // Auto-generated or user-set
    description?: string;   // First user message truncated
  };

  status: 'active' | 'archived' | 'corrupted';

  context?: {
    lastSummaryAt?: string;
    summaryMessageId?: string;
  };
}
```

### Messages (JSONL)

```typescript
// ~/.nanocoder/sessions/projects/<hash>/session-<id>/messages.jsonl

interface StoredMessage {
  id: string;
  seq: number;              // Sequence number for ordering
  parentId: string | null;  // For branching (future)
  timestamp: string;

  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;

  tokens: {
    count: number;
    cumulative: number;
  };

  // Role-specific fields
  tool?: {
    callId: string;
    name: string;
  };

  assistant?: {
    model: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;    // JSON string
    }>;
    finishReason?: string;
    durationMs?: number;
  };
}
```

### Tool Executions (JSONL)

```typescript
// ~/.nanocoder/sessions/projects/<hash>/session-<id>/tools.jsonl

interface StoredToolExecution {
  id: string;
  seq: number;
  timestamp: string;

  // Links
  messageId: string;        // Assistant message that triggered this
  toolCallId: string;       // Tool call ID from assistant

  // Execution
  tool: string;
  arguments: Record<string, unknown>;

  // Result
  result: {
    success: boolean;
    content: string;
    error?: string;
    exitCode?: number;      // For bash
  };

  // Metrics
  tokens: number;
  durationMs: number;
}
```

### Cached Summaries

```typescript
// ~/.nanocoder/sessions/projects/<hash>/session-<id>/summaries/<range>.json

interface CachedSummary {
  id: string;
  createdAt: string;

  range: {
    startMessageId: string;
    endMessageId: string;
    startSeq: number;
    endSeq: number;
    messageCount: number;
  };

  summary: {
    content: string;
    tokens: number;
    model: string;          // Model used to generate
  };

  originalTokens: number;   // Tokens before summarization
  compressionRatio: number;
}
```

---

## Migration & Compatibility

### Schema Versioning

All files include a `version` field. On load, check version and migrate if needed:

```typescript
async function loadSession(sessionDir: string): Promise<Session> {
  const metadata = await readJSON(`${sessionDir}/metadata.json`);

  if (metadata.version < CURRENT_VERSION) {
    await migrateSession(sessionDir, metadata.version, CURRENT_VERSION);
  }

  return new Session(sessionDir);
}
```

### Checkpoint Compatibility

The existing checkpoint system remains unchanged. Sessions and checkpoints serve different purposes:

| Aspect | Sessions | Checkpoints |
|--------|----------|-------------|
| Trigger | Automatic | Manual |
| Files included | No | Yes |
| Purpose | Conversation continuity | Code rollback |
| Storage | Global | Per-project |

### Future: Merging Sessions with Checkpoints

A checkpoint could optionally reference a session:

```typescript
interface CheckpointMetadata {
  // ... existing fields ...
  sessionId?: string;       // Optional link to session
}
```

This allows: "Restore checkpoint X and resume from session Y"

---

## Open Questions

1. **Session naming**: Auto-generate titles from first message, or require user input?
2. **Cross-project sessions**: Allow resuming a session in a different project?
3. **Session forking**: Allow branching from a point in history? (v2 feature)
4. **Cloud sync**: Optional sync to user's cloud storage? (v2 feature)
5. **Summarization model**: Use same model or dedicated smaller model?

---

## References

- Issue #51: /resume feature request
- Claude Code session management: `~/.claude/projects/`
- Aider history: `.aider.chat.history.md`
- LibreChat schemas: MongoDB collections for conversations/messages
