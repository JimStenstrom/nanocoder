//! Anthropic API client implementation

use async_trait::async_trait;
use futures::stream::Stream;
use futures::TryStreamExt;
use nanocoder_core::{Error, Message, MessageRole, Result};
use reqwest::{Client, RequestBuilder};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::client::{AiClient, ChatRequest, ChatResponse, TokenUsage};
use crate::streaming::StreamChunk;

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Anthropic API client
pub struct AnthropicClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl AnthropicClient {
    /// Create a new Anthropic client
    pub fn new(
        api_key: impl Into<String>,
        base_url: Option<String>,
        timeout_secs: Option<u64>,
    ) -> Result<Self> {
        let timeout = timeout_secs.unwrap_or(30);
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout))
            .build()
            .map_err(|e| Error::AiClient(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_key: api_key.into(),
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        })
    }

    /// Prepare a request with authentication headers
    fn prepare_request(&self, path: &str) -> RequestBuilder {
        self.client
            .post(format!("{}/{}", self.base_url, path))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("Content-Type", "application/json")
    }

    /// Convert ChatRequest to Anthropic API format
    fn to_anthropic_request(&self, request: &ChatRequest) -> AnthropicChatRequest {
        // Extract system message if present
        let (system, messages) = Self::extract_system_message(&request.messages);

        AnthropicChatRequest {
            model: request.model.clone(),
            messages,
            system,
            tools: request.tools.clone(),
            temperature: request.temperature,
            max_tokens: request.max_tokens.unwrap_or(4096),
            stream: if request.stream { Some(true) } else { None },
        }
    }

    /// Extract system message from messages list (Anthropic requires it separate)
    fn extract_system_message(messages: &[Message]) -> (Option<String>, Vec<Message>) {
        let mut system = None;
        let mut filtered_messages = Vec::new();

        for msg in messages {
            if msg.role == MessageRole::System {
                system = Some(msg.content.clone());
            } else {
                filtered_messages.push(msg.clone());
            }
        }

        (system, filtered_messages)
    }
}

#[async_trait]
impl AiClient for AnthropicClient {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let anthropic_req = self.to_anthropic_request(&request);

        let response = self
            .prepare_request("messages")
            .json(&anthropic_req)
            .send()
            .await
            .map_err(|e| Error::AiClient(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::AiClient(format!(
                "Anthropic API error {}: {}",
                status, error_text
            )));
        }

        let anthropic_response: AnthropicChatResponse = response
            .json()
            .await
            .map_err(|e| Error::AiClient(format!("Failed to parse response: {}", e)))?;

        // Convert Anthropic response to our format
        let content = anthropic_response
            .content
            .iter()
            .filter_map(|c| match c {
                AnthropicContent::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        let message = Message::assistant(content);

        Ok(ChatResponse {
            message,
            model: anthropic_response.model,
            usage: Some(TokenUsage {
                prompt_tokens: anthropic_response.usage.input_tokens,
                completion_tokens: anthropic_response.usage.output_tokens,
                total_tokens: anthropic_response.usage.input_tokens
                    + anthropic_response.usage.output_tokens,
            }),
            finish_reason: Some(anthropic_response.stop_reason),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn Stream<Item = Result<StreamChunk>> + Unpin + Send>> {
        let mut anthropic_req = self.to_anthropic_request(&request);
        anthropic_req.stream = Some(true);

        let response = self
            .prepare_request("messages")
            .json(&anthropic_req)
            .send()
            .await
            .map_err(|e| Error::AiClient(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::AiClient(format!(
                "Anthropic API error {}: {}",
                status, error_text
            )));
        }

        // Parse SSE stream
        let stream = response
            .bytes_stream()
            .map_err(|e| Error::AiClient(format!("Stream error: {}", e)))
            .and_then(|bytes| async move {
                let text = String::from_utf8_lossy(&bytes);

                // Parse SSE format: "data: {json}\n\n"
                for line in text.lines() {
                    if let Some(json_str) = line.strip_prefix("data: ") {
                        let event: AnthropicStreamEvent = serde_json::from_str(json_str)
                            .map_err(|e| Error::AiClient(format!("Failed to parse event: {}", e)))?;

                        match event.event_type.as_str() {
                            "content_block_delta" => {
                                if let Some(delta) = event.delta {
                                    if let Some(text) = delta.text {
                                        return Ok(StreamChunk::content(text));
                                    }
                                }
                            }
                            "message_stop" => {
                                return Ok(StreamChunk::finish("end_turn"));
                            }
                            _ => {}
                        }
                    }
                }

                // Skip empty or non-data lines
                Ok(StreamChunk::content(""))
            });

        Ok(Box::new(Box::pin(stream)))
    }

    fn provider_name(&self) -> &str {
        "anthropic"
    }
}

// Anthropic API request/response types

#[derive(Debug, Serialize)]
struct AnthropicChatRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<nanocoder_core::Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct AnthropicChatResponse {
    #[allow(dead_code)]
    id: String,
    model: String,
    content: Vec<AnthropicContent>,
    stop_reason: String,
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContent {
    Text { text: String },
    #[allow(dead_code)]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicDelta>,
}

#[derive(Debug, Deserialize)]
struct AnthropicDelta {
    text: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anthropic_client_creation() {
        let client = AnthropicClient::new("test_key", None, Some(60)).unwrap();
        assert_eq!(client.api_key, "test_key");
        assert_eq!(client.base_url, DEFAULT_BASE_URL);
        assert_eq!(client.provider_name(), "anthropic");
    }

    #[test]
    fn test_anthropic_client_custom_base_url() {
        let client = AnthropicClient::new(
            "test_key",
            Some("https://custom.api.com".to_string()),
            None,
        )
        .unwrap();
        assert_eq!(client.base_url, "https://custom.api.com");
    }

    #[test]
    fn test_extract_system_message() {
        let messages = vec![
            Message::system("You are a helpful assistant"),
            Message::user("Hello"),
            Message::assistant("Hi there"),
        ];

        let (system, filtered) = AnthropicClient::extract_system_message(&messages);

        assert_eq!(system, Some("You are a helpful assistant".to_string()));
        assert_eq!(filtered.len(), 2);
        assert!(matches!(filtered[0].role, MessageRole::User));
        assert!(matches!(filtered[1].role, MessageRole::Assistant));
    }

    #[test]
    fn test_to_anthropic_request() {
        let client = AnthropicClient::new("key", None, None).unwrap();
        let messages = vec![
            Message::system("System prompt"),
            Message::user("Hello"),
        ];
        let request = ChatRequest::new("claude-3-5-sonnet-20241022", messages)
            .with_temperature(0.7)
            .with_max_tokens(1000);

        let anthropic_req = client.to_anthropic_request(&request);
        assert_eq!(anthropic_req.model, "claude-3-5-sonnet-20241022");
        assert_eq!(anthropic_req.temperature, Some(0.7));
        assert_eq!(anthropic_req.max_tokens, 1000);
        assert_eq!(anthropic_req.system, Some("System prompt".to_string()));
        assert_eq!(anthropic_req.messages.len(), 1); // System message extracted
    }
}
