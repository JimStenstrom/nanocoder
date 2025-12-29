## Confirmation

Tested locally with Bun v1.3.4 on Linux. The root cause is confirmed:

**Node.js:**
```
Testing pino.transport() with Bun...
✅ Transport created successfully
✅ Logger works
```

**Bun:**
```
Testing pino.transport() with Bun...
✅ Transport created successfully
✅ Logger works
❌ Cannot find package 'real-require' from 'thread-stream@3.1.0/lib/worker.js'
❌ the worker thread exited
```

Pino's `thread-stream` dependency uses worker threads and `real-require`, which Bun doesn't support properly. The transport appears to initialize but crashes when the worker thread tries to start.

This confirms the fix should add a fallback logger path when `pino.transport()` fails, which ties into #241.
