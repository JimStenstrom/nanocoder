# Architecture

**Analysis Date:** 2026-01-10

## Pattern Overview

**Overall:** React-based CLI Coding Agent with Layered Architecture

**Key Characteristics:**
- Central state management via React hooks
- Event-driven with state orchestration pattern
- Human-in-the-loop tool execution
- Plugin-based extensibility via MCP servers
- Streaming LLM responses with real-time token counting

## Layers

**UI/Presentation Layer:**
- Purpose: React components for terminal UI via Ink.js
- Contains: Message displays, input components, selectors, status indicators
- Location: `source/components/`, `source/app/components/`
- Depends on: State layer (useAppState)
- Used by: App root component

**State Management Layer:**
- Purpose: Centralized state through React hooks
- Contains: 50+ state variables for messages, models, modes, connections
- Location: `source/hooks/useAppState.tsx`
- Depends on: Nothing (source of truth)
- Used by: All other hooks and components

**Business Logic Layer:**
- Purpose: LLM client, tool execution, MCP integration
- Contains: Chat handler, tool handler, initialization logic
- Location: `source/hooks/useChatHandler.tsx`, `source/hooks/useToolHandler.tsx`
- Depends on: State layer, AI client layer
- Used by: App component orchestration

**AI Client Layer:**
- Purpose: Vercel AI SDK wrapper for LLM communication
- Contains: Streaming handler, tool extraction, error handling
- Location: `source/ai-sdk-client/`
- Depends on: Configuration layer
- Used by: Business logic layer

**Tool System Layer:**
- Purpose: Tool discovery, execution, and formatting
- Contains: Static tools + MCP dynamic tools
- Location: `source/tools/`, `source/mcp/`
- Depends on: File system, external APIs
- Used by: Tool handler in business logic

**Configuration Layer:**
- Purpose: Config loading, preferences, tokenization
- Contains: Multi-source config resolution, env substitution
- Location: `source/config/`
- Depends on: File system, XDG paths
- Used by: Initialization, AI client

## Data Flow

**Chat Message Flow:**

1. User enters input via `source/app/components/chat-input.tsx`
2. Message parsed to command or chat via `source/command-parser.ts`
3. `useAppHandlers.handleMessageSubmit()` invoked
4. `useChatHandler.handleChatMessage()` builds prompt with history
5. LLM client streams response via `source/ai-sdk-client/chat/chat-handler.ts`
6. Tool calls extracted via `source/tool-calling/xml-parser.ts` (primary) or `json-parser.ts` (fallback)
7. `useToolHandler` displays confirmation, awaits user approval
8. Tool executed via `source/tools/tool-manager.ts`
9. Result formatted and appended to messages
10. Loop continues until LLM stops or no more tool calls

**State Management:**
- Central hub: `source/hooks/useAppState.tsx` (50+ useState calls)
- Other hooks receive state and setters from useAppState
- Global message queue: `source/utils/message-queue.tsx` for deep component communication
- Mode context for global state sync: `source/context/mode-context.ts`

## Key Abstractions

**ToolEntry Pattern:**
- Purpose: Unified metadata container for tools
- Location: `source/tools/tool-registry.ts`
- Structure: `{name, tool, handler, formatter, validator, streamingFormatter}`
- Pattern: Single source of truth for static + MCP tools

**LLMClient:**
- Purpose: Provider-agnostic LLM interface
- Location: `source/client-factory.ts`
- Pattern: Factory with fallback logic for configuration
- Created via: `createLLMClient(provider?)`

**Message Builder:**
- Purpose: Fluent API for constructing messages
- Location: `source/utils/message-builder.ts`
- Pattern: Builder pattern for role + content assembly

**Conversation State:**
- Purpose: Track context usage, auto-executed messages
- Location: `source/app/utils/conversation-state.ts`
- Pattern: Enhanced error messages with context

## Entry Points

**CLI Entry:**
- Location: `source/cli.tsx`
- Triggers: User runs `nanocoder` or `nanocoder run <command>`
- Responsibilities: Parse args (vscode mode, run command), render React app

**App Root:**
- Location: `source/app/App.tsx`
- Triggers: Ink render from CLI
- Responsibilities: Orchestrate hooks, manage UI state, handle mode switching

**Commands:**
- Location: `source/commands/`, `source/commands.ts`
- Triggers: `/` prefix commands in chat
- Responsibilities: Settings, navigation, integration management

## Error Handling

**Strategy:** Throw exceptions, catch at boundaries (route handlers, main functions)

**Patterns:**
- Services throw Error with descriptive messages
- Extend Error class for custom errors: `ConfigurationError`
- Async functions use try/catch, no `.catch()` chains
- Log error with context before throwing
- Include cause: `new Error('Failed to X', { cause: originalError })`

## Cross-Cutting Concerns

**Logging:**
- pino logger instance from `source/utils/logging/pino-logger.ts`
- Levels: debug, info, warn, error
- Structured logging with context objects
- Console.log allowed but discouraged in production

**Token Counting:**
- Real-time via streaming callbacks
- Multiple tokenizers: tiktoken (OpenAI), llama-tokenizer-js, @anthropic-ai/tokenizer
- Location: `source/tokenization/`

**Validation:**
- Path validation for file operations: `source/utils/path-validation.ts`
- Config validation during initialization
- Tool input validation via validators in registry

**Authentication:**
- API keys via environment variables
- Config file stores provider URLs, not secrets
- MCP servers have individual auth requirements

---

*Architecture analysis: 2026-01-10*
*Update when major patterns change*
