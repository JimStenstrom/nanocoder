//! Token counting and estimation for AI models
//!
//! This crate provides token counting for various AI providers:
//! - OpenAI models (GPT-4, GPT-3.5) using tiktoken
//! - Anthropic models (Claude) using character-based estimation
//! - Message-level token counting for context management
//! - Cost estimation based on token usage

pub mod counter;
pub mod openai;
pub mod anthropic;
pub mod tokenizer;

pub use counter::MessageTokenCounter;
pub use openai::OpenAiTokenizer;
pub use anthropic::AnthropicEstimator;
pub use tokenizer::{Tokenizer, TokenizerType};
