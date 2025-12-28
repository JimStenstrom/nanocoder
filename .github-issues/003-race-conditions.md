# Bug: Race conditions in singleton patterns and async operations

**Labels:** bug, concurrency, critical

## Description

Multiple race conditions exist in the codebase, particularly around singleton patterns and async React hook operations.

## Critical: Singleton Pattern Race Conditions

### 1. LSP Manager (`source/lsp/lsp-manager.ts`, Lines 404-408)

```typescript
export function getLSPManager(config?: LSPManagerConfig): LSPManager {
    if (!lspManagerInstance) {
        lspManagerInstance = new LSPManager(config);
    }
    return lspManagerInstance;
}
```

**Issue:** Non-thread-safe singleton. Concurrent calls can create multiple instances.

### 2. VSCode Server (`source/vscode/vscode-server.ts`, Lines 374-378)

Same pattern, same issue.

### 3. Model Database (`source/model-database/model-database.ts`, Lines 9-13)

Same pattern, same issue.

## High Risk: Async useEffect Without Cleanup

### 1. User Input (`source/components/user-input.tsx`, Lines 102-120)

```typescript
useEffect(() => {
    const runFileAutocomplete = async () => {
        const completions = await getFileCompletions(mention.mention, cwd);
        setFileCompletions(completions);  // Can update after unmount
    };
    void runFileAutocomplete();
}, [input]);
```

**Issue:** No cleanup/abort mechanism. State update can occur after component unmounts.

### 2. Tool Confirmation (`source/components/tool-confirmation.tsx`, Lines 48-107)

```typescript
React.useEffect(() => {
    const loadPreview = async () => {
        const preview = await formatter(parsedArgs);
        setFormatterPreview(preview);  // Stale closure, no abort
    };
    void loadPreview();
}, [toolCall, toolManager, colors.error]);
```

**Issue:** Missing cleanup and abort. Rapid toolCall changes cause racing state updates.

### 3. Model Selector (`source/components/model-selector.tsx`, Lines 40-71)

Same pattern - no mount check or abort controller.

## Medium Risk: Timeout Race Conditions

### LSP Client (`source/lsp/lsp-client.ts`, Lines 388-394)

```typescript
setTimeout(() => {
    if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
    }
}, 30000);
```

**Issue:** Timeout ID not stored, cannot be cleared when request completes. Creates orphaned timeouts.

## Suggested Fixes

### Singleton Pattern Fix

```typescript
let instance: MySingleton | null = null;
let instancePromise: Promise<MySingleton> | null = null;

export async function getInstance(): Promise<MySingleton> {
    if (instance) return instance;
    if (instancePromise) return instancePromise;

    instancePromise = createInstance().then(i => {
        instance = i;
        return i;
    });
    return instancePromise;
}
```

### useEffect Cleanup Fix

```typescript
useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadData = async () => {
        try {
            const data = await fetchData({ signal: controller.signal });
            if (!cancelled) {
                setState(data);
            }
        } catch (error) {
            if (!cancelled && error.name !== 'AbortError') {
                setError(error);
            }
        }
    };

    loadData();

    return () => {
        cancelled = true;
        controller.abort();
    };
}, [dependency]);
```

### Timeout Fix

```typescript
const timeoutId = setTimeout(() => {
    // ...
}, 30000);

// Store timeout ID to clear on completion
this.pendingTimeouts.set(id, timeoutId);

// On completion:
const timeoutId = this.pendingTimeouts.get(id);
if (timeoutId) {
    clearTimeout(timeoutId);
    this.pendingTimeouts.delete(id);
}
```

## Impact

- Multiple singleton instances could cause resource conflicts
- Memory leaks from unmounted component state updates
- Orphaned timeouts accumulate in event loop
- Stale data displayed due to race conditions
