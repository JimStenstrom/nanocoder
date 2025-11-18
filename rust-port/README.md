# nanocoder - Rust Port

This is a Rust port of the nanocoder CLI coding agent, maintaining feature parity with the TypeScript version while leveraging Rust's performance and safety benefits.

## Architecture

The project is organized as a Cargo workspace with the following crates:

- **nanocoder-core**: Core types, traits, and data structures (messages, tools, errors)
- **nanocoder-config**: Configuration management (JSON config, .env, preferences)
- **nanocoder-tools**: Tool implementations (file operations, bash, search, web)
- **nanocoder-ai**: AI client integration (OpenAI-compatible API, streaming)
- **nanocoder-tokenization**: Token counting for various LLM providers
- **nanocoder-mcp**: Model Context Protocol client
- **nanocoder-cli**: Main CLI binary

## Building

```bash
cargo build --release
```

## Running

```bash
cargo run --bin nanocoder
```

## Testing

```bash
cargo test
```

## Status

🚧 **Work in Progress** 🚧

This is an active port from the TypeScript codebase. See the main TypeScript implementation in the parent directory for the current production version.

## Integration with TypeScript/Ink GUI

The Rust backend will communicate with the TypeScript/Ink frontend via JSON-RPC over stdin/stdout, maintaining the rich terminal UI while benefiting from Rust's performance for core operations.
