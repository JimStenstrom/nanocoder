# Technology Stack

**Analysis Date:** 2026-01-10

## Languages

**Primary:**
- TypeScript 5.0.3 - All application code (`package.json`, `tsconfig.json`)

**Secondary:**
- JavaScript - Build scripts, config files
- JSX/TSX - React components for CLI rendering

## Runtime

**Environment:**
- Node.js >= 20 - Required via `package.json` engines field
- No .nvmrc file present

**Package Manager:**
- pnpm (primary) - `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- Workspace configuration for monorepo: root + `plugins/*`

## Frameworks

**Core:**
- React 19.0.0 - CLI component framework (`package.json`)
- Ink.js 6.3.1 - React rendering for terminal UI

**Testing:**
- AVA 6.4.1 - Test runner with serial execution
- tsx 4.20.6 - TypeScript execution for tests
- c8 10.1.3 - Code coverage (lcov, text, json-summary)
- ink-testing-library 4.0.0 - Ink component testing

**Build/Dev:**
- TypeScript Compiler (tsc) - Strict mode compilation
- tsc-alias 1.8.16 - Path alias resolution in compiled output

## Key Dependencies

**Critical:**
- @ai-sdk/openai-compatible 2.0.2 - Vercel AI SDK OpenAI-compatible provider
- ai 6.0.6 - Vercel AI SDK core library
- @modelcontextprotocol/sdk 1.25.2 - MCP client implementation

**Token Counting:**
- tiktoken 1.0.22 - OpenAI token counting (`source/tokenization/tokenizers/openai-tokenizer.ts`)
- llama-tokenizer-js 1.2.2 - Llama model tokenization
- @anthropic-ai/tokenizer 0.0.4 - Anthropic token counting

**Infrastructure:**
- undici 7.16.0 - High-performance HTTP client
- ws 8.18.0 - WebSocket server for VS Code extension
- pino 10.1.0 - Structured logging (`source/utils/logging/pino-logger.ts`)
- cheerio 1.1.2 - HTML parsing for web search tool
- dotenv 17.2.3 - Environment variable loading

**CLI/UI:**
- ink-text-input 6.0.0 - Text input component
- ink-select-input 6.2.0 - Selection input
- ink-spinner 5.0.0 - Loading spinner
- cli-highlight 2.1.11 - Code syntax highlighting

## Configuration

**Environment:**
- `.env` files with variable substitution (`$VAR`, `${VAR}`, `${VAR:-default}`)
- `agents.config.json` - AI provider and MCP server configuration

**Build:**
- `tsconfig.json` - TypeScript with strict mode, path aliases (`@/*` → `source/*`)
- `biome.json` - Code formatting and linting
- `knip.json` - Unused dependency detection

## Code Quality Tools

**Biome 2.3.10:**
- Tab indentation (2-space width)
- Single quotes, semicolons required
- Line width: 80 characters
- Trailing commas: all contexts
- File: `biome.json`

**Key Lint Rules:**
- `useExhaustiveDependencies: error`
- `noUnusedVariables: error`
- `noUnusedImports: error`
- `noExplicitAny: warn`

**Git Hooks:**
- husky 9.1.7 - Git hooks management
- lint-staged 16.2.7 - Pre-commit linting

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js 20+)
- pnpm package manager required
- Optional: semgrep for security scanning

**Production:**
- Distributed as npm package
- Runs on user's Node.js installation (>=20)
- VS Code extension available (`plugins/vscode/`)

---

*Stack analysis: 2026-01-10*
*Update after major dependency changes*
