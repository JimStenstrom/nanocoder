# External Integrations

**Analysis Date:** 2026-01-10

## APIs & External Services

**LLM Providers (OpenAI-Compatible API):**
- OpenAI - `https://api.openai.com/v1`
  - SDK/Client: @ai-sdk/openai-compatible via Vercel AI SDK
  - Auth: API key in `OPENAI_API_KEY` env var
  - Config: `source/wizard/templates/provider-templates.ts`

- Anthropic Claude - `https://api.anthropic.com/v1`
  - SDK/Client: Vercel AI SDK with OpenAI-compatible adapter
  - Auth: API key in env var
  - Token counter: `source/tokenization/tokenizers/anthropic-tokenizer.ts`

- OpenRouter - `https://openrouter.ai/api/v1`
  - SDK/Client: OpenAI-compatible
  - Auth: `OPENROUTER_API_KEY` env var
  - Special headers: `HTTP-Referer`, `X-Title` for attribution
  - Config: `source/ai-sdk-client/providers/provider-factory.ts`

- Mistral AI - `https://api.mistral.ai/v1`
  - SDK/Client: OpenAI-compatible
  - Auth: API key in env var

- Z.ai - `https://api.z.ai/api/paas/v4/`
  - SDK/Client: OpenAI-compatible
  - Auth: `ZAI_AUTH_TOKEN`, `ZAI_CODING_AUTH_TOKEN` env vars
  - Supports standard and coding subscription endpoints

- GitHub Models - `https://models.github.ai/inference`
  - SDK/Client: OpenAI-compatible
  - Model listing: `https://models.github.ai/catalog/models`
  - Config: `agents.config.example.json`

**Local Model Providers:**
- Ollama - `http://localhost:11434/v1`
  - SDK/Client: OpenAI-compatible
  - Token counter: llama-tokenizer-js
  - Config: `source/wizard/templates/provider-templates.ts`

- llama.cpp server - `http://localhost:8080/v1` (default)
  - SDK/Client: OpenAI-compatible

- LM Studio - `http://localhost:1234/v1` (default)
  - SDK/Client: OpenAI-compatible

## Data Storage

**Databases:**
- None (stateless CLI application)

**File Storage:**
- Local file system only
- Configuration: `~/.config/nanocoder/` (Linux), `~/Library/Preferences/nanocoder/` (macOS)
- Checkpoints: Local JSON files
- Usage tracking: Local persistence in config directory

**Caching:**
- In-memory caching for model metadata
- `source/models/models-cache.ts` - Model info cache with expiration
- BoundedMap for preventing unbounded memory growth

## Authentication & Identity

**Auth Provider:**
- None (no user authentication in CLI)

**API Key Management:**
- Environment variables for all API keys
- Config file stores provider URLs only (not secrets)
- `.env.example` template provided

## Model Context Protocol (MCP) Servers

**Filesystem:** `@modelcontextprotocol/server-filesystem`
- Transport: STDIO
- Config: `source/wizard/templates/mcp-templates.ts`
- Capabilities: Read/write files and directories

**GitHub:** `@modelcontextprotocol/server-github`
- Transport: STDIO
- Auth: `GITHUB_PERSONAL_ACCESS_TOKEN` env var
- Capabilities: Repository management

**PostgreSQL:** `@modelcontextprotocol/server-postgres`
- Transport: STDIO
- Auth: `POSTGRES_CONNECTION_STRING` env var
- Capabilities: Database queries

**Brave Search:** `@modelcontextprotocol/server-brave-search`
- Transport: STDIO
- Auth: `BRAVE_API_KEY` env var
- Capabilities: Web search

## External Web Services

**models.dev:**
- URL: `https://models.dev/api.json`
- Client: `source/models/models-dev-client.ts`
- Purpose: Model metadata and context limits
- HTTP library: undici

**Brave Search (Direct):**
- URL: `https://search.brave.com/search?q={query}`
- Client: `source/tools/web-search.tsx`
- Purpose: Web search results for LLM context
- HTML parsing: cheerio

**Get-MD Service:**
- Package: `@nanocollective/get-md 1.0.2`
- Client: `source/tools/fetch-url.tsx`
- Purpose: Convert web URLs to markdown for LLM context

## CI/CD & Deployment

**Hosting:**
- Distributed as npm package
- Nix flake support: `nix run github:Nano-Collective/nanocoder`
- Homebrew tap available

**CI Pipeline:**
- GitHub Actions in `.github/`
- Workflows: lint, test, build, security scan
- Tests: `pnpm test:all`

## VS Code Integration

**WebSocket Server:**
- Implementation: `source/vscode/vscode-server.ts`
- Library: ws 8.18.0
- Port: Configurable via `--vscode-port` CLI argument
- Purpose: Real-time code editing and diagnostics

**Extension:**
- Source: `plugins/vscode/`
- Build: `pnpm run build:vscode`
- Output: `assets/nanocoder-vscode.vsix`

## Environment Configuration

**Development:**
- Required env vars: Provider-specific API keys
- Secrets location: `.env.local` (gitignored)
- Template: `.env.example`

**Configuration Resolution Order:**
1. `agents.config.json` in working directory (project-level)
2. `~/.config/nanocoder/agents.config.json` (Linux)
3. `~/Library/Preferences/nanocoder/agents.config.json` (macOS)
4. `~/.agents.config.json` (legacy fallback)

**Environment Variable Substitution:**
- Syntax: `$VAR`, `${VAR}`, `${VAR:-default}`
- Implementation: `source/config/env-substitution.ts`

## Logging Configuration

**Environment Variables:**
- `NANOCODER_LOG_LEVEL` - debug, info, warn, error (default)
- `NANOCODER_LOG_TO_FILE` - Enable file logging
- `NANOCODER_LOG_TO_CONSOLE` - Enable console logging
- `NANOCODER_LOG_DIR` - Custom log directory

## Webhooks & Callbacks

**Incoming:**
- None (CLI application)

**Outgoing:**
- Health monitoring webhooks (stub implementation)
- Location: `source/utils/logging/health-monitor/alerts/alert-manager.ts`
- Status: TODO - only logs that webhook would be sent

---

*Integration audit: 2026-01-10*
*Update when adding/removing external services*
