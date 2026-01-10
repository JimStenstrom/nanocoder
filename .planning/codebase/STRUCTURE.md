# Codebase Structure

**Analysis Date:** 2026-01-10

## Directory Layout

```
nanocoder/
├── source/                    # All TypeScript source code
│   ├── cli.tsx               # Entry point (Node.js executable)
│   ├── app/                  # React root component hierarchy
│   ├── hooks/                # React state & business logic
│   ├── ai-sdk-client/        # Vercel AI SDK wrapper
│   ├── tools/                # Built-in tool handlers
│   ├── tool-calling/         # Tool call parsing (XML/JSON)
│   ├── components/           # Reusable Ink UI components
│   ├── commands/             # Built-in slash commands
│   ├── custom-commands/      # User-defined markdown commands
│   ├── config/               # Configuration loading
│   ├── mcp/                  # Model Context Protocol
│   ├── lsp/                  # Language Server Protocol
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions
│   └── wizard/               # Configuration wizard
├── plugins/                  # Extension packages
│   └── vscode/              # VS Code extension source
├── dist/                     # Compiled JavaScript output
├── assets/                   # Static assets (built extension)
├── scripts/                  # Build and utility scripts
├── .planning/               # GSD planning documents
│   └── codebase/            # Codebase mapping (this directory)
└── .claude/                  # Claude Code configuration
```

## Directory Purposes

**source/app/**
- Purpose: React root component hierarchy
- Contains: `App.tsx` (main orchestrator, 637 lines), layout components
- Key files: `App.tsx`, `components/chat-history.tsx`, `components/chat-input.tsx`
- Subdirectories: `components/` (layout), `utils/` (business logic), `prompts/` (system prompt)

**source/hooks/**
- Purpose: React state & business logic orchestration
- Contains: Central state hook + feature-specific hooks
- Key files: `useAppState.tsx` (50+ state variables), `useToolHandler.tsx`, `useAppInitialization.tsx`
- Subdirectories: `chat-handler/` (modularized chat logic with `conversation-loop.ts`)

**source/ai-sdk-client/**
- Purpose: Vercel AI SDK wrapper
- Contains: Client class, chat handling, error handling
- Key files: `ai-sdk-client.ts`, `chat/chat-handler.ts`, `chat/tool-processor.ts`
- Subdirectories: `chat/`, `converters/`, `error-handling/`, `providers/`

**source/tools/**
- Purpose: Tool system (handlers + registry)
- Contains: Built-in tool implementations
- Key files: `tool-manager.ts`, `tool-registry.ts`, `execute-bash.tsx`, `read-file.tsx`, `string-replace.tsx`
- Subdirectories: `git/` (git workflow tools)

**source/components/**
- Purpose: Reusable Ink UI components
- Contains: Message displays, inputs, selectors, status indicators
- Key files: `user-message.tsx`, `assistant-message.tsx`, `tool-confirmation.tsx`, `user-input.tsx`
- Subdirectories: `ui/` (styled components), `usage/` (token usage display)

**source/config/**
- Purpose: Configuration loading and preferences
- Contains: Multi-source config resolution, env substitution
- Key files: `index.ts` (config resolution), `preferences.ts`, `themes.ts`, `env-substitution.ts`

**source/mcp/**
- Purpose: Model Context Protocol server integration
- Contains: MCP client, transport factory
- Key files: `mcp-client.ts` (631 lines), `transport-factory.ts`

**source/commands/**
- Purpose: Built-in slash commands
- Contains: `/help`, `/model`, `/provider`, `/clear`, `/status`, etc.
- Key files: `index.ts`, individual command files (`model.ts`, `provider.ts`, etc.)

## Key File Locations

**Entry Points:**
- `source/cli.tsx` - CLI entry point with shebang
- `source/app/App.tsx` - React root component (orchestrator)
- `dist/cli.js` - Compiled executable

**Configuration:**
- `tsconfig.json` - TypeScript with strict mode, path aliases
- `biome.json` - Code formatting and linting
- `agents.config.example.json` - Example AI provider configuration
- `.env.example` - Environment variables template
- `package.json` - Project manifest and scripts

**Core Logic:**
- `source/hooks/useAppState.tsx` - Central state (50+ variables)
- `source/hooks/chat-handler/conversation/conversation-loop.ts` - LLM → tool loop
- `source/tools/tool-manager.ts` - Tool orchestration
- `source/client-factory.ts` - LLM client factory
- `source/commands.ts` - Command dispatch

**Testing:**
- `source/**/*.spec.ts` and `source/**/*.spec.tsx` - Co-located tests
- 207 test files, ~47,174 lines of test code

**Documentation:**
- `README.md` - User-facing documentation
- `CLAUDE.md` - Claude Code instructions
- `CONTRIBUTING.md` - Development guide

## Naming Conventions

**Files:**
- kebab-case.ts: Utility modules (`message-builder.ts`, `path-validation.ts`)
- kebab-case.tsx: React components (`user-message.tsx`, `tool-confirmation.tsx`)
- useHookName.tsx: React hooks (`useAppState.tsx`, `useToolHandler.tsx`)
- *.spec.ts(x): Test files alongside source

**Directories:**
- kebab-case: All directories (`custom-commands/`, `tool-calling/`)
- Plural for collections: `components/`, `hooks/`, `tools/`, `commands/`

**Special Patterns:**
- `index.ts` for barrel exports
- `@/*` path alias maps to `source/*`
- PascalCase for React component exports

## Where to Add New Code

**New Feature:**
- Primary code: Feature-specific directory under `source/`
- State: Add to `source/hooks/useAppState.tsx` or create dedicated hook
- Tests: Co-located `*.spec.ts(x)` files

**New Tool:**
- Implementation: `source/tools/{tool-name}.tsx`
- Registration: `source/tools/index.ts`
- Tests: `source/tools/{tool-name}.spec.tsx`

**New Slash Command:**
- Definition: `source/commands/{command-name}.ts(x)`
- Registration: Add to `source/commands/index.ts`

**New Component:**
- Implementation: `source/components/{component-name}.tsx`
- Types: `source/types/` if shared

**Utilities:**
- Shared helpers: `source/utils/{utility-name}.ts`
- Type definitions: `source/types/{domain}.ts`

## Special Directories

**dist/**
- Purpose: Compiled JavaScript output
- Source: TypeScript compilation via `pnpm run build`
- Committed: No (in .gitignore)

**plugins/vscode/**
- Purpose: VS Code extension source
- Source: Separate package with own build
- Build: `pnpm run build:vscode` → `assets/nanocoder-vscode.vsix`

**.planning/codebase/**
- Purpose: GSD codebase mapping documents
- Source: Generated by `/gsd:map-codebase`
- Committed: Yes

---

*Structure analysis: 2026-01-10*
*Update when directory structure changes*
