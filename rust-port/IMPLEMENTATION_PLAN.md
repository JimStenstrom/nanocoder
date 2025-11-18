# Nanocoder Rust Port - Hybrid Architecture Implementation Plan

## Architecture

**Hybrid Model:**
- **Rust Backend**: File ops, tokenization, tools, AI client/HTTP, tool execution
- **TypeScript/Ink Frontend**: Terminal UI (unchanged)
- **Bridge**: JSON-RPC over stdin/stdout OR N-API bindings

## Implementation Phases

### Phase 1: Core Backend Infrastructure ✅ (COMPLETED)
- [x] Workspace structure
- [x] Core types (Message, Tool, Error)
- [x] Configuration management (paths, env vars, preferences)
- [x] Tests for core modules

**Commits:** 2 (pushed)

### Phase 2: File Operation Tools (IN PROGRESS)
- [ ] read_file tool with tests
- [ ] create_file tool with tests
- [ ] insert_lines tool with tests
- [ ] replace_lines tool with tests
- [ ] delete_lines tool with tests
- [ ] find_files (glob) tool with tests
- [ ] search_file_contents (ripgrep) tool with tests
- [ ] Integration tests for all file ops

**Estimated commits:** 2-3

### Phase 3: Tool Execution System
- [ ] Tool registry (manage static + MCP tools)
- [ ] Tool call parser (XML format)
- [ ] Tool call parser (JSON format)
- [ ] Tool executor with validation
- [ ] Message handler
- [ ] Tests for tool system

**Estimated commits:** 2

### Phase 4: AI Client Layer
- [ ] OpenAI-compatible HTTP client (reqwest)
- [ ] Streaming support (SSE)
- [ ] Non-streaming chat
- [ ] Provider management
- [ ] Connection pooling
- [ ] Error handling
- [ ] Tests with mock server

**Estimated commits:** 2-3

### Phase 5: Tokenization
- [ ] OpenAI tokenizer (tiktoken-rs)
- [ ] Anthropic tokenizer
- [ ] Llama tokenizer
- [ ] Fallback tokenizer
- [ ] Token counting utilities
- [ ] Tests for all tokenizers

**Estimated commits:** 1-2

### Phase 6: Additional Tools
- [ ] Bash execution tool
- [ ] Web fetch tool (HTTP GET with cheerio-like parsing)
- [ ] Web search tool (if applicable)
- [ ] Tests for all tools

**Estimated commits:** 1-2

### Phase 7: Bridge Layer (TypeScript ↔ Rust)
- [ ] JSON-RPC protocol definition
- [ ] Rust server (stdin/stdout)
- [ ] TypeScript client wrapper
- [ ] Message serialization/deserialization
- [ ] Error propagation
- [ ] Integration tests

**Estimated commits:** 2

### Phase 8: Integration & Testing
- [ ] End-to-end tests (Rust backend + TS frontend)
- [ ] Performance benchmarks (file ops, tokenization)
- [ ] Memory leak tests
- [ ] Update TypeScript to use Rust backend
- [ ] Feature parity verification

**Estimated commits:** 2-3

### Phase 9: MCP Integration
- [ ] MCP client (stdio transport)
- [ ] Dynamic tool discovery
- [ ] Tool registration from MCP servers
- [ ] Tests with mock MCP server

**Estimated commits:** 1-2

### Phase 10: Production Readiness
- [ ] Logging/tracing setup
- [ ] Error messages polish
- [ ] CLI binary packaging
- [ ] Performance optimization
- [ ] Final integration tests

**Estimated commits:** 1-2

## Testing Strategy

Each module requires:
1. **Unit tests** - Test individual functions
2. **Integration tests** - Test module interactions
3. **Compatibility tests** - Verify TypeScript/Rust equivalence

Run tests before each commit:
```bash
cargo test --all
```

## Commit Guidelines

- One module/feature per commit
- All tests passing
- No breaking changes
- Descriptive commit messages

## Current Status

**Phase 1:** ✅ Complete (2 commits)
**Phase 2:** 🔄 In Progress

**Next Steps:**
1. Implement file_ops module (read, create, edit, delete, find, search)
2. Add comprehensive tests
3. Commit file operations
4. Continue to Phase 3
