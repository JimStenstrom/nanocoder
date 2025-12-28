# Security: TOCTOU vulnerabilities and argument parsing issues

**Labels:** security, enhancement

## Description

Several potential security issues were identified, primarily around time-of-check-time-of-use (TOCTOU) vulnerabilities and argument parsing.

## Issues Found

### 1. Argument Parsing in LSP Server Discovery (`source/lsp/server-discovery.ts`, Lines 248-263)

```typescript
const parts = checkCommand.split(/\s+/);
const command = parts[0];
const args = parts.slice(1);
```

**Issue:** Shell command split by whitespace without proper parsing. Arguments with embedded spaces or special characters could be mishandled.

**Current Risk:** Low - only affects LSP server verification with hardcoded commands

**Recommendation:** Use proper shell argument parsing or store commands as arrays.

### 2. TOCTOU in Transport Factory (`source/mcp/transport-factory.ts`, Lines 45-65)

```typescript
function commandExists(command: string): boolean {
    try {
        accessSync(command, fsConstants.X_OK);
        return true;
    }
    // ...
}
// Later, the command is executed in StdioClientTransport
```

**Issue:** Between checking if a command exists and executing it, an attacker with local filesystem access could replace the command.

**Current Risk:** Medium - requires local file system access

### 3. TOCTOU in Server Discovery (`source/lsp/server-discovery.ts`, Lines 226-243)

```typescript
const localBinPath = join(process.cwd(), 'node_modules', '.bin', command);
if (existsSync(localBinPath)) {
    return localBinPath;
}
```

**Issue:** Same TOCTOU vulnerability - local binary could be swapped between check and execution.

**Current Risk:** Medium - requires write access to node_modules

### 4. Template Variable Substitution (`source/custom-commands/executor.ts`, Lines 8-36)

```typescript
variables['args'] = args.join(' ');
// Later: substituteTemplateVariables replaces {{args}} in content
```

**Issue:** Custom command parameters are substituted directly without escaping. Could enable prompt injection if user provides malicious arguments.

**Current Risk:** Low - confined to LLM context

### 5. Unrestricted Environment Variable Substitution (`source/config/env-substitution.ts`, Lines 4-39)

```typescript
const envValue = process.env[varName];
if (envValue !== undefined) {
    return envValue; // No restrictions on which vars can be substituted
}
```

**Issue:** Any environment variable can be substituted into config. Sensitive credentials could be exposed.

**Current Risk:** Low - depends on configuration practices

## Well-Implemented Security (No Action Needed)

The following security measures are properly implemented:

1. **Command Injection Prevention** - All critical tools use `execFile`/`execFileSync` with array arguments
2. **Path Traversal Prevention** - System directories blocked in write operations
3. **SSRF Prevention** - Private IP ranges blocked in fetch-url
4. **Race Condition Handling** - File cache properly handles concurrent access
5. **JSON Parsing** - Safe JSON.parse with try-catch, no eval()

## Recommendations

### For TOCTOU Issues

```typescript
// Instead of check-then-use, execute directly and handle errors
try {
    const result = execFileSync(command, args);
} catch (error) {
    if (error.code === 'ENOENT') {
        // Command doesn't exist
    }
    throw error;
}
```

### For Argument Parsing

```typescript
// Store commands as arrays instead of strings
const KNOWN_SERVERS = {
    typescript: {
        check: ['typescript-language-server', '--version'],
        // ...
    }
};
```

### For Template Variables

Consider implementing escaping for special characters or validating input patterns.

### For Environment Variables

Consider implementing a whitelist of allowed environment variables for substitution.

## Impact

- TOCTOU vulnerabilities require local access to exploit
- Most issues are edge cases with limited real-world impact
- Overall security posture is good with proper command injection prevention
