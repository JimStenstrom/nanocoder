# Nanocoder

## What This Is

A local-first CLI coding agent that brings agentic coding capabilities to local models and controlled APIs like OpenRouter. Built with privacy and control in mind, Nanocoder provides a terminal-based AI assistant with tool support for file operations, command execution, and MCP server integration—giving users Claude Code-like functionality without vendor lock-in.

## Core Value

**Local-first AI coding with full user control.** Users must be able to run powerful AI coding assistance locally or through their chosen API, with complete transparency over what tools execute and when.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing codebase. -->

- ✓ Multi-provider LLM support (OpenAI, Anthropic, OpenRouter, Mistral, Ollama, llama.cpp, LM Studio) — existing
- ✓ React-based CLI with Ink.js terminal rendering — existing
- ✓ Human-in-the-loop tool confirmation (normal/auto-accept/plan modes) — existing
- ✓ Built-in tools: file read/write, bash execution, string replace, find files, web search — existing
- ✓ MCP (Model Context Protocol) server integration for extensibility — existing
- ✓ Streaming LLM responses with real-time token counting — existing
- ✓ Custom commands from markdown files (.nanocoder/commands/) — existing
- ✓ Configuration with env variable substitution — existing
- ✓ VS Code extension integration via WebSocket — existing
- ✓ Checkpoint save/restore for conversations — existing
- ✓ Token usage tracking and cost awareness — existing

### Active

<!-- Current scope. Building toward these — addressing identified concerns. -->

- [ ] Implement graceful shutdown (ShutdownManager) for proper resource cleanup
- [ ] Refactor useAppState hook (50+ useState → consolidated reducers)
- [ ] Add test coverage for App.tsx (currently excluded from coverage)
- [ ] Implement webhook functionality in health monitor alerts
- [ ] Split large wizard components into smaller, testable units
- [ ] Reduce type assertions (263 `as any` instances) with proper typing
- [ ] Add message history limits to prevent memory growth
- [ ] Implement proper Map cleanup strategies across MCP/LSP clients

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Cloud-hosted version — Contradicts local-first philosophy
- Proprietary model training — Community-led, open-source focus
- Mobile app — CLI tool; mobile support out of scope
- GUI application — Terminal-first is core differentiator

## Context

**Codebase State:**
- TypeScript 5.0.3, React 19, Ink.js 6.3.1, Node.js 20+
- 260 TypeScript files, 207 test files (~47,174 lines of tests)
- AVA test framework with serial execution
- Biome for formatting/linting (tabs, single quotes, 80-char lines)
- Hook-based state orchestration with central useAppState

**Identified Technical Debt (from CONCERNS.md):**
- App.tsx (637 lines) explicitly excluded from test coverage
- useAppState hook is a "god hook" with 50+ useState calls
- 263 type assertions bypassing TypeScript safety
- Multiple Maps without cleanup strategies (MCP, LSP clients)
- Provider wizard step is 957 lines with 9 useState calls

**Community:**
- Open-source project focused on community contributions
- Philosophy: AI should be accessible, not controlled by corporations
- Local-first approach prioritizes privacy and user control

## Constraints

- **Tech Stack**: TypeScript/React/Ink.js — Core architecture is established
- **Node Version**: >= 20 — Required by dependencies and engines field
- **Testing**: AVA with serial execution — Test infrastructure is set
- **Compatibility**: Any OpenAI-compatible API — Must maintain provider flexibility
- **Privacy**: Local-first — No telemetry or data collection

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + Ink.js for CLI | Rich terminal UI with React patterns | ✓ Good |
| Vercel AI SDK | OpenAI-compatible with streaming | ✓ Good |
| MCP for extensibility | Standard protocol for tool extension | ✓ Good |
| Central useAppState hook | Single source of truth for state | ⚠️ Revisit (50+ useState is too much) |
| Human-in-the-loop by default | Safety-first tool execution | ✓ Good |
| Co-located tests | Tests alongside source files | ✓ Good |

---
*Last updated: 2026-01-10 after initialization*
