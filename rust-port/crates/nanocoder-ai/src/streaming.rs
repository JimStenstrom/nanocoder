//! Streaming response handling

use nanocoder_core::{Message, ToolCall};
use serde::{Deserialize, Serialize};

/// A chunk of streamed content from an AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    /// Content delta (incremental text)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Tool call delta (incremental tool call)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<ToolCall>,
    /// Finish reason if this is the final chunk
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
    /// Model name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

impl StreamChunk {
    /// Create a content chunk
    pub fn content(text: impl Into<String>) -> Self {
        Self {
            content: Some(text.into()),
            tool_call: None,
            finish_reason: None,
            model: None,
        }
    }

    /// Create a tool call chunk
    pub fn tool_call(call: ToolCall) -> Self {
        Self {
            content: None,
            tool_call: Some(call),
            finish_reason: None,
            model: None,
        }
    }

    /// Create a finish chunk
    pub fn finish(reason: impl Into<String>) -> Self {
        Self {
            content: None,
            tool_call: None,
            finish_reason: Some(reason.into()),
            model: None,
        }
    }

    /// Check if this is a finish chunk
    pub fn is_finish(&self) -> bool {
        self.finish_reason.is_some()
    }
}

/// Handler for accumulating streaming chunks into a complete message
pub struct StreamHandler {
    content: String,
    tool_calls: Vec<ToolCall>,
    finish_reason: Option<String>,
    model: Option<String>,
}

impl StreamHandler {
    /// Create a new stream handler
    pub fn new() -> Self {
        Self {
            content: String::new(),
            tool_calls: Vec::new(),
            finish_reason: None,
            model: None,
        }
    }

    /// Process a stream chunk
    pub fn process_chunk(&mut self, chunk: StreamChunk) {
        if let Some(content) = chunk.content {
            self.content.push_str(&content);
        }

        if let Some(tool_call) = chunk.tool_call {
            self.tool_calls.push(tool_call);
        }

        if let Some(finish_reason) = chunk.finish_reason {
            self.finish_reason = Some(finish_reason);
        }

        if let Some(model) = chunk.model {
            self.model = Some(model);
        }
    }

    /// Build the final message
    pub fn into_message(self) -> Message {
        let mut msg = Message::assistant(&self.content);
        if !self.tool_calls.is_empty() {
            msg.tool_calls = Some(self.tool_calls);
        }
        msg
    }

    /// Get the accumulated content
    pub fn content(&self) -> &str {
        &self.content
    }

    /// Get the accumulated tool calls
    pub fn tool_calls(&self) -> &[ToolCall] {
        &self.tool_calls
    }

    /// Get the finish reason
    pub fn finish_reason(&self) -> Option<&str> {
        self.finish_reason.as_deref()
    }

    /// Check if streaming is complete
    pub fn is_complete(&self) -> bool {
        self.finish_reason.is_some()
    }
}

impl Default for StreamHandler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nanocoder_core::message::ToolFunction;
    use std::collections::HashMap;

    #[test]
    fn test_stream_chunk_content() {
        let chunk = StreamChunk::content("Hello");
        assert_eq!(chunk.content, Some("Hello".to_string()));
        assert!(chunk.tool_call.is_none());
        assert!(!chunk.is_finish());
    }

    #[test]
    fn test_stream_chunk_finish() {
        let chunk = StreamChunk::finish("stop");
        assert_eq!(chunk.finish_reason, Some("stop".to_string()));
        assert!(chunk.is_finish());
    }

    #[test]
    fn test_stream_handler() {
        let mut handler = StreamHandler::new();

        // Process content chunks
        handler.process_chunk(StreamChunk::content("Hello "));
        handler.process_chunk(StreamChunk::content("world"));

        assert_eq!(handler.content(), "Hello world");
        assert!(!handler.is_complete());

        // Process finish chunk
        handler.process_chunk(StreamChunk::finish("stop"));

        assert!(handler.is_complete());
        assert_eq!(handler.finish_reason(), Some("stop"));
    }

    #[test]
    fn test_stream_handler_with_tool_calls() {
        let mut handler = StreamHandler::new();

        let tool_call = ToolCall {
            id: "call_1".to_string(),
            function: ToolFunction {
                name: "read_file".to_string(),
                arguments: HashMap::new(),
            },
        };

        handler.process_chunk(StreamChunk::tool_call(tool_call.clone()));
        handler.process_chunk(StreamChunk::finish("tool_calls"));

        assert_eq!(handler.tool_calls().len(), 1);
        assert_eq!(handler.tool_calls()[0].id, "call_1");

        let message = handler.into_message();
        assert!(message.tool_calls.is_some());
        assert_eq!(message.tool_calls.unwrap().len(), 1);
    }

    #[test]
    fn test_stream_handler_into_message() {
        let mut handler = StreamHandler::new();
        handler.process_chunk(StreamChunk::content("Test message"));

        let message = handler.into_message();
        assert_eq!(message.content, "Test message");
    }
}
