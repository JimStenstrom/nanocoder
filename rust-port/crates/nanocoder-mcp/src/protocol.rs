//! Model Context Protocol types and messages
//!
//! Implements the MCP protocol specification for tool discovery and execution.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// MCP tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<Value>,
}

/// MCP initialization result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInitResult {
    pub server_name: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// MCP Initialize request parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: String,
    pub capabilities: ClientCapabilities,
    pub client_info: ClientInfo,
}

impl Default for InitializeParams {
    fn default() -> Self {
        Self {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: ClientInfo {
                name: "nanocoder-mcp-client".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        }
    }
}

/// Client capabilities
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClientCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub experimental: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampling: Option<Value>,
}

/// Client information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

/// MCP Initialize response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub protocol_version: String,
    pub capabilities: ServerCapabilities,
    pub server_info: ServerInfo,
}

/// Server capabilities
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub experimental: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logging: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<ToolsCapability>,
}

/// Tools capability
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsCapability {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list_changed: Option<bool>,
}

/// Server information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
}

/// List tools response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListToolsResult {
    pub tools: Vec<McpTool>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

/// Call tool request parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallToolParams {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Value>,
}

/// Call tool response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolResult {
    pub content: Vec<ToolResultContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

/// Tool result content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ToolResultContent {
    Text {
        text: String,
    },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Resource {
        resource: Value,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mcp_server_serialization() {
        let server = McpServer {
            name: "test-server".to_string(),
            command: "node".to_string(),
            args: Some(vec!["server.js".to_string()]),
            env: None,
        };

        let json = serde_json::to_string(&server).unwrap();
        assert!(json.contains("test-server"));
        assert!(json.contains("node"));
    }

    #[test]
    fn test_mcp_tool_deserialization() {
        let json = json!({
            "name": "test_tool",
            "description": "A test tool",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "arg": {"type": "string"}
                }
            }
        });

        let tool: McpTool = serde_json::from_value(json).unwrap();
        assert_eq!(tool.name, "test_tool");
        assert_eq!(tool.description, Some("A test tool".to_string()));
        assert!(tool.input_schema.is_some());
    }

    #[test]
    fn test_initialize_params_default() {
        let params = InitializeParams::default();
        assert_eq!(params.protocol_version, "2024-11-05");
        assert_eq!(params.client_info.name, "nanocoder-mcp-client");
    }

    #[test]
    fn test_call_tool_params() {
        let params = CallToolParams {
            name: "read_file".to_string(),
            arguments: Some(json!({"path": "test.txt"})),
        };

        let json = serde_json::to_string(&params).unwrap();
        let deserialized: CallToolParams = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "read_file");
    }

    #[test]
    fn test_tool_result_content_text() {
        let content = ToolResultContent::Text {
            text: "Hello, world!".to_string(),
        };

        let json = serde_json::to_value(&content).unwrap();
        assert_eq!(json["type"], "text");
        assert_eq!(json["text"], "Hello, world!");
    }

    #[test]
    fn test_list_tools_result() {
        let result = ListToolsResult {
            tools: vec![McpTool {
                name: "tool1".to_string(),
                description: Some("Tool 1".to_string()),
                input_schema: None,
            }],
            next_cursor: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("tool1"));
    }
}
