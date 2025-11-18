//! OpenAI API client implementation

use async_trait::async_trait;
use futures::stream::Stream;
use futures::TryStreamExt;
use nanocoder_core::{Error, Message, Result, ToolCall};
use reqwest::{Client, RequestBuilder};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::client::{AiClient, ChatRequest, ChatResponse, TokenUsage};
use crate::streaming::StreamChunk;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

/// OpenAI API client
pub struct OpenAiClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAiClient {
    /// Create a new OpenAI client
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
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
    }

    /// Convert ChatRequest to OpenAI API format
    fn to_openai_request(&self, request: &ChatRequest) -> OpenAiChatRequest {
        OpenAiChatRequest {
            model: request.model.clone(),
            messages: request.messages.clone(),
            tools: request.tools.clone(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: if request.stream { Some(true) } else { None },
        }
    }
}

#[async_trait]
impl AiClient for OpenAiClient {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse> {
        let openai_req = self.to_openai_request(&request);

        let response = self
            .prepare_request("chat/completions")
            .json(&openai_req)
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
                "OpenAI API error {}: {}",
                status, error_text
            )));
        }

        let openai_response: OpenAiChatResponse = response
            .json()
            .await
            .map_err(|e| Error::AiClient(format!("Failed to parse response: {}", e)))?;

        // Convert OpenAI response to our format
        let choice = openai_response
            .choices
            .first()
            .ok_or_else(|| Error::AiClient("No choices in response".to_string()))?;

        Ok(ChatResponse {
            message: choice.message.clone(),
            model: openai_response.model,
            usage: openai_response.usage.map(|u| TokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
            finish_reason: choice.finish_reason.clone(),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn Stream<Item = Result<StreamChunk>> + Unpin + Send>> {
        let mut openai_req = self.to_openai_request(&request);
        openai_req.stream = Some(true);

        let response = self
            .prepare_request("chat/completions")
            .json(&openai_req)
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
                "OpenAI API error {}: {}",
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
                        if json_str == "[DONE]" {
                            return Ok(StreamChunk::finish("stop"));
                        }

                        let delta: OpenAiStreamDelta = serde_json::from_str(json_str)
                            .map_err(|e| Error::AiClient(format!("Failed to parse delta: {}", e)))?;

                        if let Some(choice) = delta.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                return Ok(StreamChunk::content(content));
                            }
                            if let Some(finish) = &choice.finish_reason {
                                return Ok(StreamChunk::finish(finish));
                            }
                        }
                    }
                }

                // Skip empty or non-data lines
                Ok(StreamChunk::content(""))
            });

        Ok(Box::new(Box::pin(stream)))
    }

    fn provider_name(&self) -> &str {
        "openai"
    }
}

// OpenAI API request/response types

#[derive(Debug, Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<nanocoder_core::Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponse {
    #[allow(dead_code)]
    id: String,
    model: String,
    choices: Vec<OpenAiChoice>,
    usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: Message,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct OpenAiStreamDelta {
    choices: Vec<OpenAiStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiStreamChoice {
    delta: OpenAiDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiDelta {
    content: Option<String>,
    #[allow(dead_code)]
    tool_calls: Option<Vec<ToolCall>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_client_creation() {
        let client = OpenAiClient::new("test_key", None, Some(60)).unwrap();
        assert_eq!(client.api_key, "test_key");
        assert_eq!(client.base_url, DEFAULT_BASE_URL);
        assert_eq!(client.provider_name(), "openai");
    }

    #[test]
    fn test_openai_client_custom_base_url() {
        let client = OpenAiClient::new(
            "test_key",
            Some("https://custom.api.com".to_string()),
            None,
        )
        .unwrap();
        assert_eq!(client.base_url, "https://custom.api.com");
    }

    #[test]
    fn test_to_openai_request() {
        let client = OpenAiClient::new("key", None, None).unwrap();
        let messages = vec![Message::user("Hello")];
        let request = ChatRequest::new("gpt-4", messages).with_temperature(0.7);

        let openai_req = client.to_openai_request(&request);
        assert_eq!(openai_req.model, "gpt-4");
        assert_eq!(openai_req.temperature, Some(0.7));
    }
}
