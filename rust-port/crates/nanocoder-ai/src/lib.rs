//! AI client integration for nanocoder
//!
//! This crate handles communication with LLM providers:
//! - OpenAI-compatible API support
//! - Streaming and non-streaming responses
//! - Tool call parsing
//! - Provider fallback and health checks

pub mod client;
pub mod provider;
pub mod streaming;
pub mod tool_parser;

pub use client::{AiClient, AiClientBuilder};
pub use provider::Provider;
pub use streaming::StreamHandler;
