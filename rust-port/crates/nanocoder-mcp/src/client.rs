//! MCP client implementation

use crate::protocol::*;
use crate::transport::StdioTransport;
use nanocoder_core::{Result, Tool, ToolFunctionDef, ToolParameterSchema, ToolParameters};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// MCP Client for managing connections to MCP servers
pub struct McpClient {
    transports: Arc<RwLock<HashMap<String, StdioTransport>>>,
    server_tools: Arc<RwLock<HashMap<String, Vec<McpTool>>>>,
}

impl McpClient {
    /// Create a new MCP client
    pub fn new() -> Self {
        Self {
            transports: Arc::new(RwLock::new(HashMap::new())),
            server_tools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Connect to a single MCP server
    pub async fn connect_to_server(&self, server: &McpServer) -> Result<()> {
        // Create transport
        let env = server.env.clone().unwrap_or_default();
        let args = server.args.clone().unwrap_or_default();

        let transport = StdioTransport::new(&server.command, &args, &env).await?;

        // Initialize the connection
        let init_params = InitializeParams::default();
        let init_result = transport
            .send_request("initialize", Some(serde_json::to_value(&init_params)?))
            .await?;

        // Parse initialize result
        let _init_response: InitializeResult = serde_json::from_value(init_result)
            .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to parse initialize response: {}", e)))?;

        // Send initialized notification
        // Note: For notifications, we don't wait for a response
        // But our transport implementation requires responses, so we skip this for now
        // In a full implementation, we'd need to support notifications separately

        // List available tools
        let tools_result = transport.send_request("tools/list", None).await?;
        let list_result: ListToolsResult = serde_json::from_value(tools_result)
            .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to parse tools list: {}", e)))?;

        // Store server tools
        self.server_tools.write().await.insert(server.name.clone(), list_result.tools);

        // Store transport
        self.transports.write().await.insert(server.name.clone(), transport);

        Ok(())
    }

    /// Connect to multiple MCP servers
    pub async fn connect_to_servers(
        &self,
        servers: &[McpServer],
    ) -> Vec<McpInitResult> {
        let mut results = Vec::new();

        // Connect to servers in parallel
        let futures: Vec<_> = servers
            .iter()
            .map(|server| async move {
                let server_name = server.name.clone();
                match self.connect_to_server(server).await {
                    Ok(_) => {
                        let tools = self.server_tools.read().await;
                        let tool_count = tools.get(&server_name).map(|t| t.len());
                        McpInitResult {
                            server_name,
                            success: true,
                            tool_count,
                            error: None,
                        }
                    }
                    Err(e) => McpInitResult {
                        server_name,
                        success: false,
                        tool_count: None,
                        error: Some(e.to_string()),
                    },
                }
            })
            .collect();

        for future in futures {
            results.push(future.await);
        }

        results
    }

    /// Get all tools from all connected servers
    pub async fn get_all_tools(&self) -> Vec<Tool> {
        let mut tools = Vec::new();
        let server_tools = self.server_tools.read().await;

        for (server_name, mcp_tools) in server_tools.iter() {
            for mcp_tool in mcp_tools {
                // Convert MCP tool to nanocoder Tool format
                let schema = mcp_tool.input_schema.clone().unwrap_or(json!({}));

                let properties = if let Some(props) = schema.get("properties") {
                    props.clone()
                } else {
                    json!({})
                };

                let required = if let Some(req) = schema.get("required") {
                    req.as_array().cloned().unwrap_or_default()
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                } else {
                    Vec::new()
                };

                // Convert properties to ToolParameterSchema format
                let mut param_properties = HashMap::new();
                if let Some(props_obj) = properties.as_object() {
                    for (key, value) in props_obj {
                        let param_schema = ToolParameterSchema {
                            param_type: value.get("type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            description: value.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            additional: value.as_object().map(|obj| {
                                obj.iter()
                                    .filter(|(k, _)| k.as_str() != "type" && k.as_str() != "description")
                                    .map(|(k, v)| (k.clone(), v.clone()))
                                    .collect()
                            }).unwrap_or_default(),
                        };
                        param_properties.insert(key.clone(), param_schema);
                    }
                }

                let tool = Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunctionDef {
                        name: mcp_tool.name.clone(),
                        description: mcp_tool
                            .description
                            .clone()
                            .map(|desc| format!("[MCP:{}] {}", server_name, desc))
                            .unwrap_or_else(|| format!("MCP tool from {}", server_name)),
                        parameters: ToolParameters {
                            param_type: "object".to_string(),
                            properties: param_properties,
                            required,
                        },
                    },
                };

                tools.push(tool);
            }
        }

        tools
    }

    /// Get tool mapping (tool name -> server name)
    pub async fn get_tool_mapping(&self) -> HashMap<String, String> {
        let mut mapping = HashMap::new();
        let server_tools = self.server_tools.read().await;

        for (server_name, mcp_tools) in server_tools.iter() {
            for mcp_tool in mcp_tools {
                mapping.insert(mcp_tool.name.clone(), server_name.clone());
            }
        }

        mapping
    }

    /// Call a tool on an MCP server
    pub async fn call_tool(&self, tool_name: &str, args: Value) -> Result<String> {
        // Find which server has this tool
        let mapping = self.get_tool_mapping().await;
        let server_name = mapping.get(tool_name).ok_or_else(|| {
            nanocoder_core::Error::ToolExecution(format!("MCP tool not found: {}", tool_name))
        })?;

        // Get the transport
        let transports = self.transports.read().await;
        let transport = transports.get(server_name).ok_or_else(|| {
            nanocoder_core::Error::ToolExecution(format!("No MCP client connected for server: {}", server_name))
        })?;

        // Call the tool
        let params = CallToolParams {
            name: tool_name.to_string(),
            arguments: Some(args),
        };

        let result = transport
            .send_request("tools/call", Some(serde_json::to_value(&params)?))
            .await?;

        let call_result: CallToolResult = serde_json::from_value(result)
            .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to parse tool call result: {}", e)))?;

        // Check for errors
        if call_result.is_error == Some(true) {
            return Err(nanocoder_core::Error::ToolExecution(
                "Tool execution returned an error".to_string(),
            ));
        }

        // Extract text content
        for content in &call_result.content {
            if let ToolResultContent::Text { text } = content {
                return Ok(text.clone());
            }
        }

        // If no text content, return JSON representation
        Ok(serde_json::to_string(&call_result.content)?)
    }

    /// Get connected server names
    pub async fn get_connected_servers(&self) -> Vec<String> {
        self.transports.read().await.keys().cloned().collect()
    }

    /// Check if a server is connected
    pub async fn is_server_connected(&self, server_name: &str) -> bool {
        self.transports.read().await.contains_key(server_name)
    }

    /// Get tools for a specific server
    pub async fn get_server_tools(&self, server_name: &str) -> Vec<McpTool> {
        self.server_tools
            .read()
            .await
            .get(server_name)
            .cloned()
            .unwrap_or_default()
    }

    /// Disconnect from all servers
    pub async fn disconnect(&self) -> Result<()> {
        let mut transports = self.transports.write().await;

        for (server_name, mut transport) in transports.drain() {
            if let Err(e) = transport.close().await {
                tracing::error!("Error disconnecting from {}: {}", server_name, e);
            }
        }

        self.server_tools.write().await.clear();

        Ok(())
    }
}

impl Default for McpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_client_creation() {
        let client = McpClient::new();
        assert!(client.transports.try_read().is_ok());
    }

    #[tokio::test]
    async fn test_get_connected_servers_empty() {
        let client = McpClient::new();
        let servers = client.get_connected_servers().await;
        assert_eq!(servers.len(), 0);
    }

    #[tokio::test]
    async fn test_is_server_connected_false() {
        let client = McpClient::new();
        assert!(!client.is_server_connected("test-server").await);
    }

    #[tokio::test]
    async fn test_get_all_tools_empty() {
        let client = McpClient::new();
        let tools = client.get_all_tools().await;
        assert_eq!(tools.len(), 0);
    }

    #[tokio::test]
    async fn test_get_tool_mapping_empty() {
        let client = McpClient::new();
        let mapping = client.get_tool_mapping().await;
        assert_eq!(mapping.len(), 0);
    }
}
