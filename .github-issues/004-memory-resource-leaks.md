# Bug: Memory and resource leaks in event listeners and timers

**Labels:** bug, memory-leak, performance

## Description

Several locations have event listeners that are never removed, timers that are never cleared, and resources that aren't properly disposed.

## Critical Issues

### 1. LSP Client Timeout Leak (`source/lsp/lsp-client.ts`, Lines 389-394)

```typescript
setTimeout(() => {
    if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
    }
}, 30000);
```

**Issue:** Timeout ID is not stored. When requests complete normally, the timeout remains active until it fires (30s later). Every successful request creates an orphaned timeout.

### 2. Process Signal Handlers Never Removed (`source/utils/logging/index.ts`, Lines 115, 124, 134, 143)

```typescript
process.on('SIGTERM', () => { ... });
process.on('SIGINT', () => { ... });
process.on('uncaughtException', err => { ... });
process.on('unhandledRejection', (reason, promise) => { ... });
```

**Issue:** Global event listeners that accumulate if logging is reinitialized. Never removed.

## High Priority Issues

### 3. LSP Manager Event Listeners (`source/lsp/lsp-manager.ts`, Lines 123-136, 163-174)

```typescript
// Listeners added
client.on('diagnostics', (params) => { ... });
client.on('exit', (code) => { ... });

// Shutdown - no listener removal
async shutdown(): Promise<void> {
    await Promise.all(stopPromises);
    this.clients.clear();
    // Listeners NOT removed!
}
```

**Issue:** Event listeners on LSPClient instances are never explicitly removed during shutdown.

### 4. VSCode Server WebSocket Listeners (`source/vscode/vscode-server.ts`, Lines 100-110)

```typescript
this.wss.on('listening', () => { resolve(true); });
this.wss.on('connection', ws => { this.handleConnection(ws); });
this.wss.on('error', _error => { resolve(false); });
```

**Issue:** Listeners registered on WebSocketServer not explicitly removed on close.

## Medium Priority Issues

### 5. LSP Client Child Process Listeners (`source/lsp/lsp-client.ts`, Lines 70-84)

```typescript
this.process.stdout?.on('data', (data: Buffer) => { ... });
this.process.stderr?.on('data', (_data: Buffer) => {});
this.process.on('error', error => { ... });
this.process.on('exit', code => { ... });
```

**Issue:** Cleanup depends on `stop()` being called. If client is GC'd without calling stop, listeners leak.

### 6. Extension Installer Process (`source/vscode/extension-installer.ts`, Lines 82-118)

**Issue:** Child process might not be killed on errors in promise chain.

### 7. Execute Bash Tool (`source/tools/execute-bash.tsx`, Lines 18-26, 53-55)

**Issue:** Event listeners on spawned process not explicitly removed.

## Suggested Fixes

### Timeout Leak Fix

```typescript
// Store timeout IDs
private pendingTimeouts = new Map<number, NodeJS.Timeout>();

// When creating timeout:
const timeoutId = setTimeout(() => { ... }, 30000);
this.pendingTimeouts.set(requestId, timeoutId);

// When request completes:
clearTimeout(this.pendingTimeouts.get(requestId));
this.pendingTimeouts.delete(requestId);
```

### Process Signal Handler Fix

```typescript
// Store handlers for removal
const handlers = {
    sigterm: () => { ... },
    sigint: () => { ... },
};

// Register
process.on('SIGTERM', handlers.sigterm);
process.on('SIGINT', handlers.sigint);

// Cleanup function
export function cleanupSignalHandlers() {
    process.off('SIGTERM', handlers.sigterm);
    process.off('SIGINT', handlers.sigint);
}
```

### Event Listener Cleanup Pattern

```typescript
class LSPManager {
    private clientListeners = new Map<string, Function[]>();

    private addClientListener(clientName: string, event: string, handler: Function) {
        client.on(event, handler);
        if (!this.clientListeners.has(clientName)) {
            this.clientListeners.set(clientName, []);
        }
        this.clientListeners.get(clientName)!.push({ event, handler });
    }

    async shutdown(): Promise<void> {
        for (const [clientName, listeners] of this.clientListeners) {
            const client = this.clients.get(clientName);
            for (const { event, handler } of listeners) {
                client?.off(event, handler);
            }
        }
        this.clientListeners.clear();
        // ... rest of shutdown
    }
}
```

## Impact

- Memory usage grows over time
- Event loop accumulates orphaned timers
- Potential for "too many listeners" warnings
- Resources not released on shutdown
