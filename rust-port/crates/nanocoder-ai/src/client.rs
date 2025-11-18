//! Core AI client traits and types

use async_trait::async_trait;
use nanocoder_core::{Message, Result, Tool};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Request to an AI provider for chat completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    /// The model to use (e.g., "gpt-4", "claude-3-5-sonnet-20241022")
    pub model: String,
    /// Conversation messages
    pub messages: Vec<Message>,
    /// Available tools for the model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    /// Temperature for sampling (0.0 to 2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Maximum tokens to generate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Whether to stream the response
    #[serde(skip)]
    pub stream: bool,
    /// Additional provider-specific parameters
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl ChatRequest {
    /// Create a new chat request
    pub fn new(model: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            model: model.into(),
            messages,
            tools: None,
            temperature: None,
            max_tokens: None,
            stream: false,
            extra: HashMap::new(),
        }
    }

    /// Add tools to the request
    pub fn with_tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools);
        self
    }

    /// Set temperature
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }

    /// Set max tokens
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    /// Enable streaming
    pub fn with_streaming(mut self, stream: bool) -> Self {
        self.stream = stream;
        self
    }

    /// Add extra parameter
    pub fn with_extra(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.extra.insert(key.into(), value);
        self
    }
}

/// Response from an AI provider
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatResponse {
    /// The generated message
    pub message: Message,
    /// Model used for generation
    pub model: String,
    /// Token usage statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    /// Finish reason (e.g., "stop", "length", "tool_calls")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

/// Token usage statistics
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TokenUsage {
    /// Input/prompt tokens
    pub prompt_tokens: u32,
    /// Output/completion tokens
    pub completion_tokens: u32,
    /// Total tokens used
    pub total_tokens: u32,
}

/// Core trait for AI clients
#[async_trait]
pub trait AiClient: Send + Sync {
    /// Send a chat completion request
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse>;

    /// Send a streaming chat completion request
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn futures::Stream<Item = Result<crate::streaming::StreamChunk>> + Unpin + Send>>;

    /// Get the provider name
    fn provider_name(&self) -> &str;

    /// Validate the configuration
    async fn validate(&self) -> Result<()> {
        Ok(())
    }
}

/// Builder for creating AI clients
pub struct AiClientBuilder {
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    timeout_secs: Option<u64>,
}

impl AiClientBuilder {
    /// Create a new builder for the specified provider
    pub fn new(provider: impl Into<String>) -> Self {
        Self {
            provider: provider.into(),
            api_key: None,
            base_url: None,
            timeout_secs: Some(30),
        }
    }

    /// Set the API key
    pub fn api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }

    /// Set a custom base URL
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Set request timeout in seconds
    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.timeout_secs = Some(secs);
        self
    }

    /// Build the client
    pub fn build(self) -> Result<Box<dyn AiClient>> {
        match self.provider.to_lowercase().as_str() {
            "openai" => {
                let client = crate::openai::OpenAiClient::new(
                    self.api_key
                        .ok_or_else(|| nanocoder_core::Error::Config("API key required".to_string()))?,
                    self.base_url,
                    self.timeout_secs,
                )?;
                Ok(Box::new(client))
            }
            "anthropic" => {
                let client = crate::anthropic::AnthropicClient::new(
                    self.api_key
                        .ok_or_else(|| nanocoder_core::Error::Config("API key required".to_string()))?,
                    self.base_url,
                    self.timeout_secs,
                )?;
                Ok(Box::new(client))
            }
            provider => Err(nanocoder_core::Error::Config(format!(
                "Unknown provider: {}",
                provider
            ))),
        }
    }
}

impl Default for AiClientBuilder {
    fn default() -> Self {
        Self::new("openai")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_request_builder() {
        let messages = vec![Message::user("Hello")];
        let request = ChatRequest::new("gpt-4", messages.clone())
            .with_temperature(0.7)
            .with_max_tokens(1000)
            .with_streaming(true);

        assert_eq!(request.model, "gpt-4");
        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(1000));
        assert!(request.stream);
    }

    #[test]
    fn test_chat_request_with_tools() {
        let messages = vec![Message::user("Read file")];
        let tools = vec![
            Tool::new("read_file", "Read a file")
                .parameter("path", "string", "File path", true)
                .build(),
        ];

        let request = ChatRequest::new("gpt-4", messages).with_tools(tools);

        assert!(request.tools.is_some());
        assert_eq!(request.tools.unwrap().len(), 1);
    }

    #[test]
    fn test_token_usage() {
        let usage = TokenUsage {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
        };

        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 20);
        assert_eq!(usage.total_tokens, 30);
    }

    #[test]
    fn test_ai_client_builder() {
        let builder = AiClientBuilder::new("openai")
            .api_key("test_key")
            .timeout_secs(60);

        assert_eq!(builder.provider, "openai");
        assert_eq!(builder.api_key, Some("test_key".to_string()));
        assert_eq!(builder.timeout_secs, Some(60));
    }
}
