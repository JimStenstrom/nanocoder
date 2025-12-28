# Bug: FileSnapshotService validateRestorePath tests fail in root/container environments

**Labels:** bug, tests

## Description

The `FileSnapshotService.validateRestorePath()` method tests fail when running in environments where the test runner has elevated privileges (root) or in containers.

## Failing Tests

5 tests in `source/services/file-snapshot.spec.ts` are failing:

1. `FileSnapshotService validateRestorePath handles non-writable existing files` (line 357)
2. `FileSnapshotService validateRestorePath skips file checks when directory creation fails` (line 393)
3. `FileSnapshotService validateRestorePath handles multiple files with mixed scenarios` (line 434)

## Root Cause

The tests set files/directories to read-only permissions (0o444) and expect `fs.access(path, fs.constants.W_OK)` to fail. However, when running as root:

- Linux ignores permission bits for the root user
- `fs.access(..., W_OK)` returns success for read-only files when run as root
- This causes `result.valid` to be `true` when tests expect `false`

## Steps to Reproduce

```bash
# Run as root or in a container
pnpm test:ava source/services/file-snapshot.spec.ts
```

## Expected Behavior

Tests should pass in all environments, including when running as root.

## Suggested Fixes

1. **Skip tests when running as root:**
```typescript
const isRoot = process.getuid && process.getuid() === 0;
if (isRoot) {
    t.pass('Test skipped when running as root');
    return;
}
```

2. **Use a different validation approach** in `validateRestorePath()`:
   - Check file ownership in addition to permissions
   - Use stat to check permission bits directly instead of relying on access()

3. **Document the limitation** if skipping tests

## Related Files

- `source/services/file-snapshot.ts` - Line 161-218 (`validateRestorePath` method)
- `source/services/file-snapshot.spec.ts` - Lines 341-453 (failing tests)
