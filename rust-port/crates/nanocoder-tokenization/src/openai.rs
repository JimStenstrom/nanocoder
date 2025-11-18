//! OpenAI tokenization using tiktoken

use crate::tokenizer::{Tokenizer, TokenizerType};
use nanocoder_core::Result;
use tiktoken_rs::{cl100k_base, o200k_base, p50k_base, r50k_base, CoreBPE};

/// OpenAI tokenizer using tiktoken
pub struct OpenAiTokenizer {
    bpe: CoreBPE,
    model: String,
}

impl OpenAiTokenizer {
    /// Create a tokenizer for a specific model
    pub fn new(model: impl Into<String>) -> Result<Self> {
        let model = model.into();
        let bpe = Self::get_bpe_for_model(&model)?;

        Ok(Self { bpe, model })
    }

    /// Get the appropriate BPE encoding for a model
    fn get_bpe_for_model(model: &str) -> Result<CoreBPE> {
        let model_lower = model.to_lowercase();

        // o200k_base for GPT-4o models
        if model_lower.contains("gpt-4o") || model_lower.contains("o1-") {
            return o200k_base().map_err(|e| {
                nanocoder_core::Error::Other(format!("Failed to load o200k_base: {}", e))
            });
        }

        // cl100k_base for GPT-4, GPT-3.5-turbo, text-embedding-ada-002
        if model_lower.contains("gpt-4")
            || model_lower.contains("gpt-3.5")
            || model_lower.contains("text-embedding")
        {
            return cl100k_base().map_err(|e| {
                nanocoder_core::Error::Other(format!("Failed to load cl100k_base: {}", e))
            });
        }

        // p50k_base for code models
        if model_lower.contains("code") {
            return p50k_base().map_err(|e| {
                nanocoder_core::Error::Other(format!("Failed to load p50k_base: {}", e))
            });
        }

        // r50k_base for older models (davinci, curie, babbage, ada)
        if model_lower.contains("davinci")
            || model_lower.contains("curie")
            || model_lower.contains("babbage")
            || model_lower.contains("ada")
        {
            return r50k_base().map_err(|e| {
                nanocoder_core::Error::Other(format!("Failed to load r50k_base: {}", e))
            });
        }

        // Default to cl100k_base for unknown models
        cl100k_base()
            .map_err(|e| nanocoder_core::Error::Other(format!("Failed to load cl100k_base: {}", e)))
    }

    /// Get the model name
    pub fn model(&self) -> &str {
        &self.model
    }
}

impl Tokenizer for OpenAiTokenizer {
    fn count_tokens(&self, text: &str) -> Result<usize> {
        let tokens = self.bpe.encode_with_special_tokens(text);
        Ok(tokens.len())
    }

    fn estimate_tokens(&self, text: &str) -> usize {
        // tiktoken is fast enough that we can just use exact counting
        self.count_tokens(text).unwrap_or_else(|_| {
            // Fallback to character-based estimation
            (text.len() + 3) / 4
        })
    }

    fn tokenizer_type(&self) -> TokenizerType {
        TokenizerType::OpenAI
    }

    fn max_context_length(&self) -> usize {
        let model_lower = self.model.to_lowercase();

        // GPT-4 models
        if model_lower.contains("gpt-4-turbo") || model_lower.contains("gpt-4-1106") {
            return 128000;
        }
        if model_lower.contains("gpt-4-32k") {
            return 32768;
        }
        if model_lower.contains("gpt-4") {
            return 8192;
        }

        // GPT-3.5 models
        if model_lower.contains("gpt-3.5-turbo-16k") {
            return 16384;
        }
        if model_lower.contains("gpt-3.5") {
            return 4096;
        }

        // Default
        8192
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_tokenizer_creation() {
        let tokenizer = OpenAiTokenizer::new("gpt-4").unwrap();
        assert_eq!(tokenizer.model(), "gpt-4");
        assert_eq!(tokenizer.tokenizer_type(), TokenizerType::OpenAI);
    }

    #[test]
    fn test_openai_tokenizer_count() {
        let tokenizer = OpenAiTokenizer::new("gpt-4").unwrap();

        let count = tokenizer.count_tokens("Hello, world!").unwrap();
        // "Hello, world!" should be 4 tokens in cl100k_base
        assert!(count >= 3 && count <= 5, "Expected ~4 tokens, got {}", count);
    }

    #[test]
    fn test_openai_tokenizer_empty_string() {
        let tokenizer = OpenAiTokenizer::new("gpt-4").unwrap();
        let count = tokenizer.count_tokens("").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_openai_tokenizer_context_length() {
        let tokenizer_4 = OpenAiTokenizer::new("gpt-4").unwrap();
        assert_eq!(tokenizer_4.max_context_length(), 8192);

        let tokenizer_4_32k = OpenAiTokenizer::new("gpt-4-32k").unwrap();
        assert_eq!(tokenizer_4_32k.max_context_length(), 32768);

        let tokenizer_4_turbo = OpenAiTokenizer::new("gpt-4-turbo").unwrap();
        assert_eq!(tokenizer_4_turbo.max_context_length(), 128000);

        let tokenizer_35 = OpenAiTokenizer::new("gpt-3.5-turbo").unwrap();
        assert_eq!(tokenizer_35.max_context_length(), 4096);

        let tokenizer_35_16k = OpenAiTokenizer::new("gpt-3.5-turbo-16k").unwrap();
        assert_eq!(tokenizer_35_16k.max_context_length(), 16384);
    }

    #[test]
    fn test_openai_tokenizer_long_text() {
        let tokenizer = OpenAiTokenizer::new("gpt-4").unwrap();

        let text = "This is a longer piece of text that contains multiple sentences. \
                    It should be tokenized accurately by the tiktoken library. \
                    The token count should be reasonable and consistent.";

        let count = tokenizer.count_tokens(text).unwrap();
        // This text should be roughly 30-40 tokens
        assert!(count >= 25 && count <= 50, "Expected 25-50 tokens, got {}", count);
    }
}
