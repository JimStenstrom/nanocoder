## Root Cause Analysis

### Summary

The crash is caused by **Pino's transport API incompatibility with the Bun runtime**. The application calls `pino.transport()` early in the startup sequence, before any UI renders or error handling can catch the failure.

### Crash Flow

```
1. User runs: bun nanocoder
2. cli.tsx renders <App />
3. App.tsx:43 - Logger created in useMemo()
   └── const logger = useMemo(() => createPinoLogger(), []);
4. pino-logger.ts:82-84 - pino.transport({ target: 'pino/file', ... })
5. ❌ Bun throws: "unable to determine transport target for 'pino/file'"
6. Unhandled exception, app crashes before UI renders
```

### Technical Cause

Pino transports use Node.js worker threads internally. Bun's worker thread implementation differs, causing `pino.transport()` to fail when dynamically resolving the `'pino/file'` target at runtime.

**Known Bun/Pino incompatibility issues:**
- [oven-sh/bun#4280](https://github.com/oven-sh/bun/issues/4280)
- [oven-sh/bun#5410](https://github.com/oven-sh/bun/issues/5410)
- [pinojs/pino#1964](https://github.com/pinojs/pino/issues/1964)

### Related Issue: #241

This issue is related to #241 (LoggerProvider async loading bug). The codebase has a `LoggerProvider` class with a fallback console logger that *could* prevent this crash, but:

1. **`App.tsx` bypasses it** - calls `createPinoLogger()` directly with no fallback
2. **LoggerProvider itself is broken** - #241 documents a flag logic bug where `_dependenciesLoaded` is set before async loading begins, causing real dependencies to never load

### Proposed Fix (Single PR for both issues)

A single PR could close both #128 and #241 by:

1. **Fix LoggerProvider's flag logic (#241):**
   - Use separate flags: `_fallbackInitialized` and `_realDependenciesLoaded`
   - Allow async Pino loading to complete properly

2. **Use LoggerProvider in App.tsx (#128):**
   - Replace direct `createPinoLogger()` call with `LoggerProvider.getInstance().getLogger()`
   - Provides graceful fallback when Pino transport fails

3. **Add Bun runtime detection (optional enhancement):**
   ```typescript
   const isBun = typeof globalThis.Bun !== 'undefined';
   if (isBun) {
       // Skip pino.transport(), use console fallback
   }
   ```

### Expected Result After Fix

| Runtime | Current Behavior | After Fix |
|---------|------------------|-----------|
| Node.js | ✅ Works | ✅ Works (Pino file logging) |
| Bun | ❌ Crashes | ✅ Works (console fallback) |

### Workaround (for now)

Install with Node.js instead of Bun:
```bash
npm i -g nanocoder
```

### Files Involved

- `source/app/App.tsx:43` - Logger initialization
- `source/utils/logging/pino-logger.ts:74-84` - Transport creation (crash site)
- `source/utils/logging/logger-provider.ts` - Fallback mechanism (broken, see #241)
