# Coding Conventions

**Analysis Date:** 2026-01-10

## Naming Patterns

**Files:**
- kebab-case for utilities: `message-builder.ts`, `path-validation.ts`, `file-cache.ts`
- kebab-case for components: `user-message.tsx`, `tool-confirmation.tsx`, `assistant-message.tsx`
- camelCase starting with `use` for hooks: `useAppState.tsx`, `useToolHandler.tsx`, `useTheme.tsx`
- `*.spec.ts(x)` for test files alongside source

**Functions:**
- camelCase: `createLLMClient()`, `loadPreferences()`, `testProviderConnection()`
- Async functions clearly named: `createAISDKClient()`, `fetchLocalModels()`
- Handler functions: `useChatHandler`, `useAppHandlers`, `useModeHandlers`
- Factory functions: `createClientFactory()`, `ClientFactory.create()`

**Variables:**
- camelCase: `isValidFilePath`, `shouldRenderWelcome`, `messageTokenCache`
- Boolean prefixes: `is*`, `should*`, `has*`, `can*` (e.g., `isThinking`, `isToolExecuting`)
- Constants: `UPPERCASE_WITH_UNDERSCORES` from `source/constants.ts`

**Types:**
- PascalCase for interfaces/types: `LLMClient`, `AIProviderConfig`, `Message`, `ToolCall`
- No `I` prefix for interfaces
- Descriptive names: `ConversationContext`, `CheckpointListItem`, `CustomCommandMetadata`

## Code Style

**Formatting (Biome):**
- Config: `biome.json`
- Indentation: Tabs (2-space width equivalent)
- Line width: 80 characters
- Line endings: LF

**Quotes & Punctuation:**
- Single quotes for strings in TypeScript/JavaScript
- Double quotes for JSX attributes
- Semicolons required
- Trailing commas in all contexts
- No bracket spacing: `{a: b}` not `{ a: b }`
- Arrow parentheses: as needed (omit single params)

**Linting:**
- Tool: Biome 2.3.10 (`biome.json`)
- Key rules:
  - `useExhaustiveDependencies: error` - Catch missing dependencies
  - `noUnusedVariables: error` - Remove dead code
  - `noUnusedImports: error` - Clean imports
  - `noExplicitAny: warn` - Type safety (warning level)
- Run: `pnpm test:lint`
- Auto-fix: `pnpm test:lint:fix`

## Import Organization

**Order:**
1. Node.js built-ins (`fs`, `path`, `os`)
2. External packages (`react`, `ink`, `commander`)
3. Internal modules using path alias (`@/lib`, `@/services`)
4. Relative imports (`./utils`, `../types`)
5. Type imports (`import type { User }`)

**Grouping:**
- Blank line between groups
- Alphabetical within each group
- Type imports last within each group

**Path Aliases:**
- `@/*` maps to `source/*` (configured in `tsconfig.json`)
- Example: `import { Message } from '@/types/core'`

## Error Handling

**Patterns:**
- Throw errors at source, catch at boundaries (route handlers, main functions)
- Extend Error class for custom errors: `ConfigurationError`
- Async functions use try/catch, not `.catch()` chains
- Include cause: `new Error('Failed to X', { cause: originalError })`

**Error Types:**
- Throw on: invalid input, missing dependencies, invariant violations
- Log error with context before throwing
- Validation errors shown before execution (fail fast)

## Logging

**Framework:**
- pino logger from `source/utils/logging/pino-logger.ts`
- Levels: debug, info, warn, error (no trace)

**Patterns:**
- Structured logging with context: `logger.info({ userId, action }, 'User action')`
- Log at service boundaries, not in utility functions
- Log state transitions, external API calls, errors
- Console.log allowed but discouraged (Biome config allows it)

## Comments

**When to Comment:**
- Explain why, not what: `// Retry 3 times because API has transient failures`
- Document business rules, algorithms, edge cases
- Avoid obvious comments: `// set count to 0`

**JSDoc/TSDoc:**
- Required for public API functions
- Optional for internal functions if signature is self-explanatory
- Use `@param`, `@returns`, `@throws` tags

**Section Separators:**
```typescript
// ============================================================================
// ConfigurationError Tests
// ============================================================================
```

**TODO Comments:**
- Format: `// TODO: description`
- Link to issue if exists: `// TODO: Fix race condition (issue #123)`

## Function Design

**Size:**
- Keep under 50 lines
- Extract helpers for complex logic
- One level of abstraction per function

**Parameters:**
- Max 3 parameters
- Use options object for 4+ parameters: `function create(options: CreateOptions)`
- Destructure in parameter list: `function process({ id, name }: ProcessParams)`

**Return Values:**
- Explicit return statements
- Return early for guard clauses
- Use Result pattern for expected failures where appropriate

## Module Design

**Exports:**
- Named exports preferred
- Default exports only for React components
- Export public API from index.ts barrel files

**Barrel Files:**
- `index.ts` re-exports public API
- Keep internal helpers private (don't export from index)
- Avoid circular dependencies (import from specific files if needed)

## React Patterns

**Hooks:**
- Custom hooks in `source/hooks/`
- Extract logic from components into hooks
- Use `useCallback` and `useMemo` appropriately

**Components:**
- Functional components only
- Props interface defined above component
- Co-located styles (no separate CSS files)

---

*Convention analysis: 2026-01-10*
*Update when patterns change*
