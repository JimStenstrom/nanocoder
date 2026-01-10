# Testing Patterns

**Analysis Date:** 2026-01-10

## Test Framework

**Runner:**
- AVA 6.4.1
- Config: `package.json` under `"ava"` key
- Serial execution: `"serial": true` (one test at a time)
- No worker threads: `"workerThreads": false`

**Assertion Library:**
- AVA built-in assertions
- Matchers: `t.true()`, `t.false()`, `t.is()`, `t.deepEqual()`, `t.regex()`, `t.throws()`

**Run Commands:**
```bash
pnpm test:ava                           # Run all tests
pnpm test:ava source/path/to/file.spec.ts  # Single file
pnpm test:ava:coverage                  # Tests with coverage
pnpm test:all                           # Full suite: format, lint, types, tests, knip
```

## Test File Organization

**Location:**
- Co-located with source: `source/**/*.spec.ts` and `source/**/*.spec.tsx`
- Complex features: `__tests__/` subdirectory with organized test files

**Naming:**
- Simple: `module-name.spec.ts`
- Complex: `module-name.feature.spec.ts` (e.g., `useInputState.deletion.spec.ts`)
- Helper files excluded: `*-helpers.ts`, `test-helpers.ts`

**Structure:**
```
source/
  hooks/
    useAppState.tsx
    useToolHandler.tsx
    __tests__/
      test-helpers.ts
      useInputState.deletion.spec.ts
      useInputState.state-management.spec.ts
  tools/
    execute-bash.tsx
    execute-bash.spec.tsx
    read-file.tsx
    read-file.spec.tsx
```

## Test Structure

**Suite Organization:**
```typescript
import test from 'ava';

// Section separators for organization
// ============================================================================
// ConfigurationError Tests
// ============================================================================

test.before(() => {
  // Setup shared resources (e.g., temp directory)
});

test.beforeEach(() => {
  // Per-test setup (e.g., reset mocks)
});

test.afterEach(() => {
  // Per-test cleanup (e.g., restore mocks)
});

test.after.always(() => {
  // Cleanup that always runs (e.g., remove temp files)
});

test('descriptive test name', t => {
  // arrange
  const input = createTestInput();

  // act
  const result = functionName(input);

  // assert
  t.is(result, expected);
});
```

**Patterns:**
- Use `test.before()` for shared setup (temp directories, fixtures)
- Use `test.beforeEach()` for per-test reset
- Use `test.after.always()` for cleanup that must run
- Explicit arrange/act/assert sections in complex tests

## Mocking

**Framework:**
- Manual mocking (no dedicated mocking library)
- Store originals for restoration

**Patterns:**
```typescript
// Store originals
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd;

// Mock fetch helper
function createMockFetch(shouldResolve: boolean, status = 200): typeof fetch {
  return (async () => {
    if (!shouldResolve) {
      throw new TypeError('Failed to fetch');
    }
    return {
      ok: status >= 200 && status < 300,
      status,
    } as Response;
  }) as typeof fetch;
}

test.beforeEach(() => {
  globalThis.fetch = originalFetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.cwd = originalCwd;
});

test('uses mock fetch', t => {
  globalThis.fetch = createMockFetch(true, 200);
  // test code
});
```

**What to Mock:**
- External HTTP calls (fetch, undici)
- File system operations (for isolated tests)
- Environment variables (process.env)
- Current working directory (process.cwd)

**What NOT to Mock:**
- Internal pure functions
- Simple utilities
- TypeScript types

## Fixtures and Factories

**Test Data:**
```typescript
// Factory function in test file
function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    targetDir: '/tmp/test',
    global: false,
    ...overrides
  };
}

// Temp directory pattern
const testDir = join(tmpdir(), `nanocoder-test-${Date.now()}`);

test.before(() => {
  mkdirSync(testDir, { recursive: true });
});

test.after.always(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
```

**Location:**
- Factory functions: Define in test file near usage
- Shared fixtures: `source/**/test-helpers.ts` (excluded from test runs)
- Temp files: Created in `tmpdir()` with unique names

## Coverage

**Requirements:**
- No enforced coverage target
- Coverage tracked for awareness
- `source/app/App.tsx` explicitly excluded (complex Ink component)

**Configuration:**
- Tool: c8 10.1.3
- Reporters: text, lcov, json-summary
- Exclusions: Test files, spec files

**View Coverage:**
```bash
pnpm test:ava:coverage
open coverage/index.html
```

## Test Types

**Unit Tests:**
- Test single function/module in isolation
- Mock external dependencies
- Fast execution (<100ms per test)
- Examples: `source/custom-commands/parser.spec.ts`, `source/wizard/validation.spec.ts`

**Integration Tests:**
- Test multiple modules together
- Mock only external boundaries (HTTP, file system)
- Examples: `source/client-factory.spec.ts` (config loading + client creation)

**Component Tests:**
- Test React components using ink-testing-library
- Examples: `source/app.spec.tsx`

**E2E Tests:**
- Not currently implemented
- CLI integration tested manually

## Common Patterns

**Async Testing:**
```typescript
test('handles async operation', async t => {
  const result = await asyncFunction();
  t.is(result, 'expected');
});
```

**Error Testing:**
```typescript
test('throws on invalid input', t => {
  t.throws(() => parse(null), { message: /Cannot parse/ });
});

// Async error
test('rejects on failure', async t => {
  await t.throwsAsync(asyncCall(), { message: /error/ });
});
```

**File System Testing:**
```typescript
function createTestConfig(content: object, dir: string = testDir): string {
  const configPath = join(dir, 'agents.config.json');
  writeFileSync(configPath, JSON.stringify(content, null, 2));
  return configPath;
}
```

**Snapshot Testing:**
- Not used in this codebase
- Prefer explicit assertions for clarity

## Test Statistics

- **Test files:** 207
- **Test lines:** ~47,174 lines
- **Coverage:** App.tsx excluded, other core modules covered

---

*Testing analysis: 2026-01-10*
*Update when test patterns change*
