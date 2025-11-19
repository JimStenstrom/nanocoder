//! Bridge server for handling JSON-RPC over stdin/stdout

use crate::bridge::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use nanocoder_ai::{AiClient, ChatRequest, Provider, ProviderConfig};
use nanocoder_core::Result;
use nanocoder_mcp::{McpClient, McpServer};
use nanocoder_tools::{ToolRegistry, execute_tool_call};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::RwLock;

/// Bridge server state
pub struct BridgeServer {
    tool_registry: Arc<ToolRegistry>,
    ai_client: Arc<RwLock<Option<Box<dyn AiClient>>>>,
    mcp_client: Arc<McpClient>,
}

impl BridgeServer {
    /// Create a new bridge server
    pub fn new() -> Self {
        let mut registry = ToolRegistry::new();

        // Register all built-in tools
        registry.register("read_file", Arc::new(nanocoder_tools::ReadFileTool));
        registry.register("create_file", Arc::new(nanocoder_tools::CreateFileTool));
        registry.register("insert_lines", Arc::new(nanocoder_tools::InsertLinesTool));
        registry.register("replace_lines", Arc::new(nanocoder_tools::ReplaceLinesTool));
        registry.register("delete_lines", Arc::new(nanocoder_tools::DeleteLinesTool));
        registry.register("find_files", Arc::new(nanocoder_tools::FindFilesTool));
        registry.register("search_file_contents", Arc::new(nanocoder_tools::SearchFileContentsTool));
        registry.register("execute_bash", Arc::new(nanocoder_tools::ExecuteBashTool));
        registry.register("web_fetch", Arc::new(nanocoder_tools::WebFetchTool::new().unwrap()));

        Self {
            tool_registry: Arc::new(registry),
            ai_client: Arc::new(RwLock::new(None)),
            mcp_client: Arc::new(McpClient::new()),
        }
    }

    /// Initialize AI client
    pub async fn init_ai_client(&self, provider: Provider, api_key: String) -> Result<()> {
        let config = ProviderConfig::new(provider, api_key);
        let client = config.build_client()?;
        *self.ai_client.write().await = Some(client);
        Ok(())
    }

    /// Handle a JSON-RPC request
    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        match request.method.as_str() {
            "tool.execute" => self.handle_tool_execute(request).await,
            "ai.chat" => self.handle_ai_chat(request).await,
            "ai.init" => self.handle_ai_init(request).await,
            "tools.list" => self.handle_tools_list(request).await,
            "mcp.connect" => self.handle_mcp_connect(request).await,
            "mcp.list_tools" => self.handle_mcp_list_tools(request).await,
            "mcp.call_tool" => self.handle_mcp_call_tool(request).await,
            _ => JsonRpcResponse::error(
                request.id,
                JsonRpcError::method_not_found(&request.method),
            ),
        }
    }

    /// Handle tool execution
    async fn handle_tool_execute(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let params = match request.params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing params"),
                );
            }
        };

        let tool_call = match serde_json::from_value::<nanocoder_core::ToolCall>(params) {
            Ok(tc) => tc,
            Err(e) => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params(format!("Invalid tool call: {}", e)),
                );
            }
        };

        match execute_tool_call(&tool_call, &self.tool_registry).await {
            Ok(result) => JsonRpcResponse::success(
                request.id.unwrap_or(Value::Null),
                json!({ "output": result }),
            ),
            Err(e) => JsonRpcResponse::error(
                request.id,
                JsonRpcError::internal_error(format!("Tool execution failed: {}", e)),
            ),
        }
    }

    /// Handle AI chat request
    async fn handle_ai_chat(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let client_guard = self.ai_client.read().await;
        let client = match client_guard.as_ref() {
            Some(c) => c,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::internal_error("AI client not initialized"),
                );
            }
        };

        let params = match request.params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing params"),
                );
            }
        };

        let chat_request = match serde_json::from_value::<ChatRequest>(params) {
            Ok(req) => req,
            Err(e) => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params(format!("Invalid chat request: {}", e)),
                );
            }
        };

        match client.chat(chat_request).await {
            Ok(response) => {
                let result = serde_json::to_value(response).unwrap_or(Value::Null);
                JsonRpcResponse::success(request.id.unwrap_or(Value::Null), result)
            }
            Err(e) => JsonRpcResponse::error(
                request.id,
                JsonRpcError::internal_error(format!("AI chat failed: {}", e)),
            ),
        }
    }

    /// Handle AI client initialization
    async fn handle_ai_init(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let params = match request.params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing params"),
                );
            }
        };

        let provider_str = params["provider"].as_str().unwrap_or("openai");
        let api_key = match params["apiKey"].as_str() {
            Some(key) => key.to_string(),
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing apiKey"),
                );
            }
        };

        let provider = Provider::from_str(provider_str).unwrap_or(Provider::OpenAI);

        match self.init_ai_client(provider, api_key).await {
            Ok(_) => JsonRpcResponse::success(
                request.id.unwrap_or(Value::Null),
                json!({ "status": "initialized" }),
            ),
            Err(e) => JsonRpcResponse::error(
                request.id,
                JsonRpcError::internal_error(format!("Failed to initialize AI client: {}", e)),
            ),
        }
    }

    /// Handle listing available tools
    async fn handle_tools_list(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let definitions = self.tool_registry.get_definitions();
        let result = serde_json::to_value(definitions).unwrap_or(Value::Null);
        JsonRpcResponse::success(request.id.unwrap_or(Value::Null), result)
    }

    /// Handle MCP connect request
    async fn handle_mcp_connect(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let params = match request.params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing params"),
                );
            }
        };

        // Parse servers from params
        let servers: Vec<McpServer> = match serde_json::from_value(params) {
            Ok(s) => s,
            Err(e) => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params(format!("Invalid server list: {}", e)),
                );
            }
        };

        // Connect to servers
        let results = self.mcp_client.connect_to_servers(&servers).await;
        let result = serde_json::to_value(results).unwrap_or(Value::Null);
        JsonRpcResponse::success(request.id.unwrap_or(Value::Null), result)
    }

    /// Handle MCP list tools request
    async fn handle_mcp_list_tools(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let tools = self.mcp_client.get_all_tools().await;
        let result = serde_json::to_value(tools).unwrap_or(Value::Null);
        JsonRpcResponse::success(request.id.unwrap_or(Value::Null), result)
    }

    /// Handle MCP call tool request
    async fn handle_mcp_call_tool(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let params = match request.params {
            Some(p) => p,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing params"),
                );
            }
        };

        let tool_name = match params.get("name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => {
                return JsonRpcResponse::error(
                    request.id,
                    JsonRpcError::invalid_params("Missing tool name"),
                );
            }
        };

        let args = params.get("arguments").cloned().unwrap_or(json!({}));

        match self.mcp_client.call_tool(tool_name, args).await {
            Ok(output) => JsonRpcResponse::success(
                request.id.unwrap_or(Value::Null),
                json!({ "output": output }),
            ),
            Err(e) => JsonRpcResponse::error(
                request.id,
                JsonRpcError::internal_error(format!("MCP tool execution failed: {}", e)),
            ),
        }
    }

    /// Run the bridge server (stdin/stdout)
    pub async fn run(&self) -> Result<()> {
        let stdin = tokio::io::stdin();
        let mut stdout = tokio::io::stdout();
        let mut reader = BufReader::new(stdin);
        let mut line = String::new();

        tracing::info!("Bridge server started, listening on stdin");

        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF
                    tracing::info!("EOF received, shutting down");
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    // Parse JSON-RPC request
                    let request: JsonRpcRequest = match serde_json::from_str(trimmed) {
                        Ok(req) => req,
                        Err(e) => {
                            tracing::error!("Failed to parse request: {}", e);
                            let error_response = JsonRpcResponse::error(
                                None,
                                JsonRpcError::parse_error(),
                            );
                            let response_json = serde_json::to_string(&error_response).unwrap();
                            stdout.write_all(response_json.as_bytes()).await?;
                            stdout.write_all(b"\n").await?;
                            stdout.flush().await?;
                            continue;
                        }
                    };

                    tracing::debug!("Received request: {:?}", request.method);

                    // Handle request
                    let response = self.handle_request(request).await;

                    // Send response
                    let response_json = serde_json::to_string(&response)
                        .unwrap_or_else(|_| {
                            serde_json::to_string(&JsonRpcResponse::error(
                                None,
                                JsonRpcError::internal_error("Failed to serialize response"),
                            ))
                            .unwrap()
                        });

                    stdout.write_all(response_json.as_bytes()).await?;
                    stdout.write_all(b"\n").await?;
                    stdout.flush().await?;
                }
                Err(e) => {
                    tracing::error!("Error reading stdin: {}", e);
                    break;
                }
            }
        }

        Ok(())
    }
}

impl Default for BridgeServer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bridge_server_creation() {
        let server = BridgeServer::new();
        assert!(server.ai_client.read().await.is_none());
    }

    #[tokio::test]
    async fn test_tools_list_handler() {
        let server = BridgeServer::new();
        let request = JsonRpcRequest::new(json!(1), "tools.list", None);
        let response = server.handle_request(request).await;

        assert!(response.result.is_some());
        assert!(response.error.is_none());
    }

    #[tokio::test]
    async fn test_unknown_method_handler() {
        let server = BridgeServer::new();
        let request = JsonRpcRequest::new(json!(1), "unknown.method", None);
        let response = server.handle_request(request).await;

        assert!(response.result.is_none());
        assert!(response.error.is_some());
        assert_eq!(response.error.unwrap().code, -32601);
    }
}
