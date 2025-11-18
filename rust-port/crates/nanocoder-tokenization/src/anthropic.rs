//! Anthropic token estimation
//!
//! Claude models don't have an official tokenizer library, so we use
//! character-based estimation calibrated for Claude models.

use crate::tokenizer::{Tokenizer, TokenizerType};
use nanocoder_core::Result;

/// Anthropic token estimator
pub struct AnthropicEstimator {
    model: String,
}

impl AnthropicEstimator {
    /// Create a new estimator for a Claude model
    pub fn new(model: impl Into<String>) -> Self {
        Self {
            model: model.into(),
        }
    }

    /// Get the model name
    pub fn model(&self) -> &str {
        &self.model
    }
}

impl Tokenizer for AnthropicEstimator {
    fn count_tokens(&self, text: &str) -> Result<usize> {
        Ok(self.estimate_tokens(text))
    }

    fn estimate_tokens(&self, text: &str) -> usize {
        // Claude tokenizer is roughly similar to GPT tokenizers
        // Empirically: 1 token ≈ 3.5-4 characters for English text
        // We use 3.5 for a slightly more conservative estimate
        let char_count = text.chars().count();

        // For very short texts, use a minimum of 1 token per 3 chars
        if char_count < 10 {
            return (char_count + 2) / 3;
        }

        // For longer texts, use 3.5 chars per token
        ((char_count * 10) + 34) / 35
    }

    fn tokenizer_type(&self) -> TokenizerType {
        TokenizerType::Anthropic
    }

    fn max_context_length(&self) -> usize {
        let model_lower = self.model.to_lowercase();

        // Claude 3 models have 200k context
        if model_lower.contains("claude-3") {
            return 200000;
        }

        // Claude 2 models
        if model_lower.contains("claude-2.1") {
            return 200000;
        }
        if model_lower.contains("claude-2") {
            return 100000;
        }

        // Claude 1 / Instant
        if model_lower.contains("claude-instant") {
            return 100000;
        }

        // Default conservative value
        100000
    }
}

impl Default for AnthropicEstimator {
    fn default() -> Self {
        Self::new("claude-3-5-sonnet-20241022")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anthropic_estimator_creation() {
        let estimator = AnthropicEstimator::new("claude-3-5-sonnet-20241022");
        assert_eq!(estimator.model(), "claude-3-5-sonnet-20241022");
        assert_eq!(estimator.tokenizer_type(), TokenizerType::Anthropic);
    }

    #[test]
    fn test_anthropic_estimator_empty_string() {
        let estimator = AnthropicEstimator::new("claude-3-opus");
        let count = estimator.count_tokens("").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_anthropic_estimator_short_text() {
        let estimator = AnthropicEstimator::new("claude-3-opus");

        // "hello" is 5 chars, should be about 2 tokens
        let count = estimator.count_tokens("hello").unwrap();
        assert_eq!(count, 2); // (5 + 2) / 3 = 2
    }

    #[test]
    fn test_anthropic_estimator_medium_text() {
        let estimator = AnthropicEstimator::new("claude-3-opus");

        let text = "Hello, world! This is a test.";
        let count = estimator.count_tokens(text).unwrap();

        // 30 chars, should be about 9 tokens with 3.5 char/token
        // (30 * 10 + 34) / 35 = 334 / 35 = 9
        assert_eq!(count, 9);
    }

    #[test]
    fn test_anthropic_estimator_long_text() {
        let estimator = AnthropicEstimator::new("claude-3-opus");

        let text = "This is a longer piece of text that contains multiple sentences. \
                    It should provide a reasonable token count estimate. \
                    The estimation is based on character count.";

        let count = estimator.count_tokens(text).unwrap();
        let char_count = text.chars().count();

        // Should be roughly char_count / 3.5
        let expected = ((char_count * 10) + 34) / 35;
        assert_eq!(count, expected);
    }

    #[test]
    fn test_anthropic_context_lengths() {
        let claude_3 = AnthropicEstimator::new("claude-3-opus");
        assert_eq!(claude_3.max_context_length(), 200000);

        let claude_3_sonnet = AnthropicEstimator::new("claude-3-5-sonnet-20241022");
        assert_eq!(claude_3_sonnet.max_context_length(), 200000);

        let claude_2_1 = AnthropicEstimator::new("claude-2.1");
        assert_eq!(claude_2_1.max_context_length(), 200000);

        let claude_2 = AnthropicEstimator::new("claude-2");
        assert_eq!(claude_2.max_context_length(), 100000);

        let claude_instant = AnthropicEstimator::new("claude-instant");
        assert_eq!(claude_instant.max_context_length(), 100000);
    }

    #[test]
    fn test_anthropic_estimator_unicode() {
        let estimator = AnthropicEstimator::new("claude-3-opus");

        // Test with unicode characters
        let text = "Hello 世界! 🌍";
        let count = estimator.count_tokens(text).unwrap();

        // Should count characters, not bytes
        let char_count = text.chars().count(); // Should be 11
        let expected = (char_count + 2) / 3; // Short text formula
        assert_eq!(count, expected);
    }
}
