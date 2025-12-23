# Test Coverage Gaps Analysis

**Date:** 2025-12-23
**Context:** Post-refactoring sprint review

## Summary

After the recent refactoring sprint, an audit identified **34 source files with business logic that lack test coverage**. This document tracks these gaps for prioritized resolution.

---

## Critical Gaps (Tier 1)

Core business logic central to app functionality:

| File | Description | Lines |
|------|-------------|-------|
| `source/hooks/chat-handler/conversation/conversation-loop.tsx` | Main conversation orchestration - streaming, tool parsing, execution | ~200 |
| `source/app/utils/conversationState.ts` | ConversationStateManager - progress tracking, repetition detection | ~150 |
| `source/utils/logging/pino-logger.ts` | Core Pino logger with transports, redaction, correlation | ~230 |
| `source/hooks/useAppState.tsx` | Central app state - tokenizer, preferences, tool manager init | ~150 |

---

## High Priority Gaps (Tier 2)

Significant logic with potential impact:

| File | Description |
|------|-------------|
| `source/app/utils/appUtils.ts` | `handleMessageSubmission()`, `createClearMessagesHandler()` |
| `source/hooks/chat-handler/conversation/tool-executor.tsx` | `executeToolsDirectly()` - tool execution and validation |
| `source/utils/logging/correlation.ts` | Correlation context, async local storage, ID generation |
| `source/utils/logging/config.ts` | Platform-specific config, environment detection |
| `source/utils/logging/performance.ts` | Performance metrics, CPU/memory tracking |
| `source/hooks/useAppInitialization.tsx` | App initialization sequence |

---

## Medium Priority Gaps (Tier 3)

Specific features with moderate complexity:

| File | Description |
|------|-------------|
| `source/hooks/chat-handler/utils/context-checker.tsx` | `checkContextUsage()` - token limit warnings |
| `source/hooks/chat-handler/utils/message-helpers.tsx` | `displayError()` - error display with cancellation |
| `source/hooks/useToolHandler.tsx` | Tool confirmation and execution handling |
| `source/hooks/useAppHandlers.tsx` | Command and mode handlers |
| `source/hooks/useModeHandlers.tsx` | Mode switching logic |
| `source/hooks/useDirectoryTrust.tsx` | Directory trust management |
| `source/command-parser.ts` | Input command parsing |
| `source/message-handler.ts` | Message handling business logic |
| `source/client-factory.ts` | LLM client creation factory |
| `source/prompt-history.ts` | Prompt history management |

---

## Coverage by Area

| Directory | Coverage | Notes |
|-----------|----------|-------|
| `ai-sdk-client/` | **100%** | Excellent - all modules tested |
| `health-monitor/` | **95%** | Very good |
| `tokenization/` | **100%** | Complete |
| `log-query/` | **100%** | Complete |
| `tools/` | **90%** | Good |
| `hooks/` | **~50%** | Needs attention |
| `utils/logging/` core | **~40%** | Significant gaps |
| `chat-handler/conversation/` | **0%** | Critical gap |
| `app/utils/` | **0%** | Critical gap |

---

## Files Already Well-Tested

These modules have good coverage and can serve as examples:

- `source/ai-sdk-client/*.ts` - All have matching spec files
- `source/utils/logging/health-monitor/**/*.ts` - Comprehensive tests
- `source/tokenization/*.ts` - Full coverage
- `source/tool-calling/*.ts` - Full coverage

---

## Recommended Test Patterns

Based on existing tests in the codebase:

```typescript
// Framework: AVA
import test from 'ava';

// Mock fetch with try/finally cleanup
test.serial('description', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) } as Response);

  try {
    const result = await functionUnderTest();
    t.true(result.success);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// React components with ink-testing-library
import {render} from 'ink-testing-library';

test('component renders', t => {
  const {lastFrame} = render(<Component />);
  t.regex(lastFrame()!, /expected text/);
});
```

---

## Action Items

- [ ] Add tests for `conversation-loop.tsx` (critical path)
- [ ] Add tests for `conversationState.ts` (critical state management)
- [ ] Add tests for `pino-logger.ts` (core infrastructure)
- [ ] Add tests for `useAppState.tsx` (central state hook)
- [ ] Review and prioritize Tier 2 files
- [ ] Consider adding coverage thresholds to CI

---

## Related

- Issue #173: Refactoring sprint
- PR #194: Split App component into focused modules
- PR #193: Split health-monitor into focused modules
- PR #192: Split log-query into focused modules
- PR #190: Split AISDKClient into focused modules
- PR #188: Split useChatHandler into focused modules
