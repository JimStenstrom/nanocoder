# Bug: Silent catch blocks swallow errors without logging

**Labels:** bug, error-handling, developer-experience

## Description

Multiple locations in the codebase have catch blocks that silently swallow errors without any logging, making debugging difficult when issues occur.

## Affected Files and Locations

### Critical (Core Functionality)

1. **`source/ai-sdk-client/AISDKClient.ts`** (Lines 76-79)
   - `updateContextSize()` silently fails, sets context to 0
   - Impact: Context size fetch failures completely hidden

2. **`source/models/model-database.ts`** (Lines 74-75)
   - `refreshModelsAsync()` silently fails
   - Impact: Model fetching errors hidden from UI

3. **`source/prompt-history.ts`** (Lines 37-41)
   - `loadHistory()` treats all errors as "file not found"
   - Impact: Permission errors or corruption hidden

### Medium (Feature Functionality)

4. **`source/lsp/lsp-client.ts`** (Lines 111-113, 284-286, 449-451)
   - `stop()`, `getDiagnostics()`, `handleData()` all have silent catches
   - Impact: LSP shutdown, diagnostic, and parsing errors hidden

5. **`source/usage/storage.ts`** (Lines 20-22, 56-60)
   - Silent catches in path resolution and file migration
   - Impact: Storage errors hidden, data loss possible

6. **`source/tools/write-file.tsx`** (Lines 135-142, 176-178)
   - Silent catches in syntax highlighting and cache reading
   - Impact: Cache errors hidden

### Low (Non-Critical)

7. **`source/hooks/chat-handler/utils/context-checker.tsx`** (Lines 70-72)
   - Context checking errors silently ignored

8. **`source/tools/string-replace.tsx`** (Lines 504-506)
   - VS Code integration errors silently ignored

## Fire-and-Forget Promises (Related Issue)

Several locations use `void` to fire-and-forget async operations without error handling:

- `source/prompt-history.ts` (Line 103): `void this.saveHistory();`
- `source/ai-sdk-client/AISDKClient.ts` (Lines 66, 100): `void this.updateContextSize();`
- `source/models/model-database.ts` (Line 27): `void this.refreshModelsAsync();`

## Suggested Fix

Replace silent catches with proper logging:

```typescript
// Before
} catch {
    // Silently fail
}

// After
} catch (error) {
    logDebug('Operation failed', {
        context: 'functionName',
        error: error instanceof Error ? error.message : 'Unknown error'
    });
}
```

For fire-and-forget promises:
```typescript
// Before
void this.saveHistory();

// After
this.saveHistory().catch(error => {
    logWarning('Failed to save history', { error });
});
```

## Impact

- Debugging is extremely difficult when errors are silently swallowed
- Users have no indication that features are failing
- Data loss can occur without any warning
