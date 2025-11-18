//! Core tokenizer trait and types

use nanocoder_core::Result;

/// Type of tokenizer/estimator to use
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenizerType {
    /// OpenAI models (GPT-4, GPT-3.5, etc.)
    OpenAI,
    /// Anthropic models (Claude)
    Anthropic,
    /// Character-based fallback estimation
    Fallback,
}

impl TokenizerType {
    /// Get the appropriate tokenizer type for a model name
    pub fn from_model(model: &str) -> Self {
        let model_lower = model.to_lowercase();

        if model_lower.contains("gpt") || model_lower.contains("text-") || model_lower.contains("davinci") {
            TokenizerType::OpenAI
        } else if model_lower.contains("claude") {
            TokenizerType::Anthropic
        } else {
            TokenizerType::Fallback
        }
    }
}

/// Core trait for token counting
pub trait Tokenizer: Send + Sync {
    /// Count tokens in a text string
    fn count_tokens(&self, text: &str) -> Result<usize>;

    /// Estimate tokens (may be less accurate but faster)
    fn estimate_tokens(&self, text: &str) -> usize {
        // Default: use character-based estimation (1 token ≈ 4 characters)
        (text.len() + 3) / 4
    }

    /// Get the tokenizer type
    fn tokenizer_type(&self) -> TokenizerType;

    /// Get the maximum context length for this tokenizer
    fn max_context_length(&self) -> usize {
        8192 // Default conservative value
    }
}

/// Fallback character-based estimator
pub struct FallbackEstimator;

impl Tokenizer for FallbackEstimator {
    fn count_tokens(&self, text: &str) -> Result<usize> {
        Ok(self.estimate_tokens(text))
    }

    fn estimate_tokens(&self, text: &str) -> usize {
        // Conservative estimate: 1 token ≈ 4 characters
        (text.len() + 3) / 4
    }

    fn tokenizer_type(&self) -> TokenizerType {
        TokenizerType::Fallback
    }
}

impl Default for FallbackEstimator {
    fn default() -> Self {
        Self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenizer_type_from_model() {
        assert_eq!(TokenizerType::from_model("gpt-4"), TokenizerType::OpenAI);
        assert_eq!(TokenizerType::from_model("gpt-3.5-turbo"), TokenizerType::OpenAI);
        assert_eq!(TokenizerType::from_model("text-davinci-003"), TokenizerType::OpenAI);
        assert_eq!(TokenizerType::from_model("claude-3-5-sonnet-20241022"), TokenizerType::Anthropic);
        assert_eq!(TokenizerType::from_model("claude-3-opus"), TokenizerType::Anthropic);
        assert_eq!(TokenizerType::from_model("unknown-model"), TokenizerType::Fallback);
    }

    #[test]
    fn test_fallback_estimator() {
        let estimator = FallbackEstimator;

        // "hello world" is 11 chars, should be about 3 tokens
        let count = estimator.count_tokens("hello world").unwrap();
        assert_eq!(count, 3); // (11 + 3) / 4 = 3

        // 100 characters should be about 25 tokens
        let text = "a".repeat(100);
        let count = estimator.count_tokens(&text).unwrap();
        assert_eq!(count, 25); // (100 + 3) / 4 = 25
    }
}
