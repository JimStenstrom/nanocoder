use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Message role in the conversation (OpenAI-compatible)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

/// Tool call structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolFunction {
    pub name: String,
    pub arguments: HashMap<String, serde_json::Value>,
}

/// Message in the conversation
/// Maintains OpenAI-compatible format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl Message {
    /// Create a new user message
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::User,
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    /// Create a new assistant message
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::Assistant,
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    /// Create a new system message
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::System,
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    /// Create a new tool result message
    pub fn tool_result(tool_call_id: impl Into<String>, name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: MessageRole::Tool,
            content: content.into(),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
        }
    }

    /// Create an assistant message with tool calls
    pub fn assistant_with_tools(content: impl Into<String>, tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: MessageRole::Assistant,
            content: content.into(),
            tool_calls: Some(tool_calls),
            tool_call_id: None,
            name: None,
        }
    }
}

/// Tool result structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub role: MessageRole,
    pub name: String,
    pub content: String,
}

impl ToolResult {
    pub fn new(tool_call_id: impl Into<String>, name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            tool_call_id: tool_call_id.into(),
            role: MessageRole::Tool,
            name: name.into(),
            content: content.into(),
        }
    }

    /// Convert to a Message
    pub fn into_message(self) -> Message {
        Message::tool_result(self.tool_call_id, self.name, self.content)
    }
}

/// Stream callbacks for handling streaming responses
#[derive(Debug, Clone)]
pub struct StreamCallbacks {
    pub on_token: Option<fn(&str)>,
    pub on_tool_call: Option<fn(&ToolCall)>,
    pub on_finish: Option<fn()>,
}

impl Default for StreamCallbacks {
    fn default() -> Self {
        Self {
            on_token: None,
            on_tool_call: None,
            on_finish: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_user_message() {
        let msg = Message::user("Hello");
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.content, "Hello");
        assert!(msg.tool_calls.is_none());
    }

    #[test]
    fn test_create_assistant_message() {
        let msg = Message::assistant("Hi there");
        assert_eq!(msg.role, MessageRole::Assistant);
        assert_eq!(msg.content, "Hi there");
    }

    #[test]
    fn test_create_tool_result() {
        let msg = Message::tool_result("call_123", "read_file", "file contents");
        assert_eq!(msg.role, MessageRole::Tool);
        assert_eq!(msg.tool_call_id, Some("call_123".to_string()));
        assert_eq!(msg.name, Some("read_file".to_string()));
    }

    #[test]
    fn test_serialize_message() {
        let msg = Message::user("test");
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"role\":\"user\""));
        assert!(json.contains("\"content\":\"test\""));
    }
}
