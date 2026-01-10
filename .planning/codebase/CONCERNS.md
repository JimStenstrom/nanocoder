# Codebase Concerns

**Analysis Date:** 2026-01-10

## Tech Debt

**Central State Hook Complexity:**
- Issue: `source/hooks/useAppState.tsx` contains 50+ useState calls (god-hook anti-pattern)
- Why: Rapid feature accumulation without state consolidation
- Impact: Very difficult to test, reason about, or maintain; tightly coupled state
- Fix approach: Refactor to ~10 consolidated state objects using useReducer or state machine

**Large Provider Step Component:**
- Issue: `source/wizard/steps/provider-step.tsx` is 957 lines with 9 useState calls
- Why: Complex multi-mode wizard with many states
- Impact: Hard to test, reuse, or refactor; complex state transitions
- Fix approach: Extract into smaller components, use state machine for wizard flow

**App Component Size:**
- Issue: `source/app/App.tsx` is 637 lines orchestrating many hooks
- Why: Central orchestration of all application concerns
- Impact: Explicitly excluded from test coverage
- Fix approach: Extract orchestration logic into dedicated hooks, add integration tests

## Known Bugs

**Graceful Shutdown Not Implemented:**
- Symptoms: Application exits with `process.exit(0)` directly
- Trigger: Any exit scenario
- File: `source/app/App.tsx:91`
- Workaround: None currently
- Root cause: ShutdownManager not implemented (TODO references issue #239)
- Fix: Implement ShutdownManager for proper resource cleanup

**Plan Mode Blocking Incomplete:**
- Symptoms: Plan mode restrictions may not block all intended operations
- Trigger: Using plan development mode
- File: `source/hooks/chat-handler/conversation/conversation-loop.tsx:269`
- Root cause: TODO notes old tool references no longer exist
- Fix: Implement registry-based blocking

## Security Considerations

**Command Execution:**
- Risk: Bash tool accepts user commands for shell execution
- Files: `source/services/bash-executor.ts:51-53`
- Current mitigation: Designed for intentional shell execution (user-initiated)
- Recommendations: Document security implications for users

**Config File Permissions:**
- Risk: API keys stored in env files should not be world-readable
- Current mitigation: .gitignore excludes .env files
- Recommendations: Add config file permission checks on load

## Performance Bottlenecks

**Unbounded Message History:**
- Problem: Messages array grows unbounded in long conversations
- Files: `source/hooks/useAppState.tsx:48-49`
- Measurement: Not measured (potential memory leak)
- Cause: No pruning or limit on message history
- Improvement path: Implement message history limits with automatic pruning

**Multiple Maps Without Cleanup:**
- Problem: Several Map instances accumulate data without aggressive cleanup
- Files: `source/mcp/mcp-client.ts` (4 Maps), `source/lsp/lsp-manager.ts` (4 Maps), `source/lsp/lsp-client.ts` (2 Maps)
- Cause: Long-running processes could accumulate stale references
- Improvement path: Implement cleanup strategies, use BoundedMap consistently

## Fragile Areas

**Type Assertions:**
- Why fragile: 263 instances of `as any`, `@ts-ignore` bypass type checking
- Files: Spread across `source/mcp/mcp-client.ts`, `source/lsp/lsp-client.ts`, and others
- Common failures: Type mismatches masked, runtime errors
- Safe modification: Remove type assertions incrementally, add proper types
- Test coverage: Types not runtime-checked

**Biome Linter Too Permissive:**
- Why fragile: `noExplicitAny: warn` instead of `error` in `biome.json:52`
- Common failures: New `any` types added without friction
- Safe modification: Change to error level and fix existing warnings
- Test coverage: Linting runs but doesn't block on any

## Dependencies at Risk

**None Critical:**
- All major dependencies are actively maintained
- TypeScript 5.0.3, React 19, Ink 6.3, AVA 6.4 are current
- Node >= 20 requirement is reasonable

**Ignored Vulnerability:**
- `package.json` lines 155-157: GHSA-8r9q-7v3j-jr4g explicitly ignored
- Impact: Should review if ignore is still justified
- Recommendation: Check CVE details and document reason

## Missing Critical Features

**Webhook Integration Stub:**
- Problem: Health monitoring webhooks only log, don't send
- File: `source/utils/logging/health-monitor/alerts/alert-manager.ts:61`
- Current workaround: Monitor logs manually
- Blocks: Automated alerting for production use
- Implementation complexity: Low (add HTTP call)

**Deprecation Warning Missing:**
- Problem: console.log facade should warn about deprecation
- File: `source/utils/logging/index.ts:75`
- Current workaround: Only logs to stderr in dev mode
- Blocks: Users properly warned about deprecated API
- Implementation complexity: Low (add warning)

## Test Coverage Gaps

**App Component Untested:**
- What's not tested: `source/app/App.tsx` (637 lines) explicitly excluded
- Risk: Core orchestration logic could break unnoticed
- Priority: High
- Difficulty to test: Complex Ink component with many hooks

**Wizard Steps:**
- What's not tested: `source/wizard/steps/provider-step.tsx` (957 lines)
- Risk: Configuration wizard could break
- Priority: Medium
- Difficulty to test: Complex multi-state wizard

**LSP/MCP Lifecycle:**
- What's not tested: Server connection lifecycle, reconnection
- Risk: Integration failures in production
- Priority: Medium
- Difficulty to test: Requires mock servers

## Scaling Limits

**In-Memory State:**
- Current capacity: Unknown (not measured)
- Limit: Node.js memory limits
- Symptoms at limit: Process crash
- Scaling path: Implement message pruning, state persistence

## Summary Statistics

| Metric | Count | Status |
|--------|-------|--------|
| TypeScript files (non-test) | 260 | Good |
| Test files | 207 | Good coverage |
| Large files (>400 lines) | 15 | Needs refactoring |
| TODO/FIXME comments | 4 | Minor |
| Type assertions (`as any`, `@ts-ignore`) | 263 | Moderate concern |
| Try/catch blocks | 403 | Good |
| Maps without explicit cleanup | 12+ | Medium concern |
| Console statements (prod code) | 5-7 | Minor |
| Excluded from test coverage | 1 major file | Should fix |

---

*Concerns audit: 2026-01-10*
*Update as issues are fixed or new ones discovered*
