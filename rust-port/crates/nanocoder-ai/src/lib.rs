//! AI client integration for nanocoder
//!
//! This crate handles communication with LLM providers:
//! - OpenAI API support (GPT-4, GPT-3.5, etc.)
//! - Anthropic API support (Claude models)
//! - Streaming and non-streaming responses
//! - Provider registry and configuration management
//! - Token usage tracking

pub mod anthropic;
pub mod client;
pub mod openai;
pub mod provider;
pub mod streaming;

pub use anthropic::AnthropicClient;
pub use client::{AiClient, AiClientBuilder, ChatRequest, ChatResponse, TokenUsage};
pub use openai::OpenAiClient;
pub use provider::{Provider, ProviderConfig, ProviderRegistry};
pub use streaming::{StreamChunk, StreamHandler};
