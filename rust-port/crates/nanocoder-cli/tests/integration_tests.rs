//! Integration tests for the complete nanocoder stack
//!
//! These tests verify that all components work together correctly:
//! - Tool execution through the registry
//! - Bridge server communication
//! - AI client integration
//! - End-to-end workflows

use nanocoder_cli::{BridgeServer, JsonRpcRequest};
use nanocoder_core::{Message, ToolCall, message::ToolFunction};
use nanocoder_tools::ToolRegistry;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

#[tokio::test]
async fn test_tool_registry_integration() {
    // Create a full registry with all tools
    let mut registry = ToolRegistry::new();

    // Register all built-in tools
    registry.register("read_file", Arc::new(nanocoder_tools::ReadFileTool));
    registry.register("create_file", Arc::new(nanocoder_tools::CreateFileTool));
    registry.register("find_files", Arc::new(nanocoder_tools::FindFilesTool));
    registry.register("execute_bash", Arc::new(nanocoder_tools::ExecuteBashTool));

    // Verify all tools are registered
    let tool_names = registry.list_names();
    assert!(tool_names.contains(&"read_file".to_string()));
    assert!(tool_names.contains(&"create_file".to_string()));
    assert!(tool_names.contains(&"find_files".to_string()));
    assert!(tool_names.contains(&"execute_bash".to_string()));

    // Get tool definitions
    let definitions = registry.get_definitions();
    assert_eq!(definitions.len(), 4);

    // Verify each tool has proper definition
    for tool in definitions {
        assert!(!tool.function.name.is_empty());
        assert!(!tool.function.description.is_empty());
        assert_eq!(tool.tool_type, "function");
    }
}

#[tokio::test]
async fn test_bash_tool_execution() {
    let mut registry = ToolRegistry::new();
    registry.register("execute_bash", Arc::new(nanocoder_tools::ExecuteBashTool));

    // Create a tool call
    let mut args = HashMap::new();
    args.insert("command".to_string(), json!("echo 'Hello from Rust'"));

    let tool_call = ToolCall {
        id: "test_1".to_string(),
        function: ToolFunction {
            name: "execute_bash".to_string(),
            arguments: args,
        },
    };

    // Execute the tool
    let result = nanocoder_tools::execute_tool_call(&tool_call, &registry).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    assert!(output.contains("Hello from Rust"));
}

#[tokio::test]
async fn test_find_files_tool_execution() {
    let mut registry = ToolRegistry::new();
    registry.register("find_files", Arc::new(nanocoder_tools::FindFilesTool));

    // Create a tool call to find Rust files
    let mut args = HashMap::new();
    args.insert("pattern".to_string(), json!("*.rs"));

    let tool_call = ToolCall {
        id: "test_2".to_string(),
        function: ToolFunction {
            name: "find_files".to_string(),
            arguments: args,
        },
    };

    // Execute the tool
    let result = nanocoder_tools::execute_tool_call(&tool_call, &registry).await;

    assert!(result.is_ok());
    let output = result.unwrap();
    // Should find at least main.rs and lib.rs
    assert!(output.contains(".rs"));
}

#[tokio::test]
async fn test_bridge_server_tool_list() {
    let server = BridgeServer::new();

    // Create a tools.list request
    let request = JsonRpcRequest::new(
        json!(1),
        "tools.list",
        None,
    );

    // Handle the request
    let response = server.handle_request(request).await;

    // Verify response
    assert!(response.result.is_some());
    assert!(response.error.is_none());

    // Parse the tools
    let tools: Vec<nanocoder_core::Tool> = serde_json::from_value(response.result.unwrap()).unwrap();
    assert!(!tools.is_empty());
}

#[tokio::test]
async fn test_bridge_server_tool_execution() {
    let server = BridgeServer::new();

    // Create a tool execution request for bash
    let mut args = HashMap::new();
    args.insert("command".to_string(), json!("echo 'Integration test'"));

    let params = json!({
        "id": "test_call",
        "function": {
            "name": "execute_bash",
            "arguments": args
        }
    });

    let request = JsonRpcRequest::new(
        json!(2),
        "tool.execute",
        Some(params),
    );

    // Handle the request
    let response = server.handle_request(request).await;

    // Verify response
    assert!(response.result.is_some());
    assert!(response.error.is_none());

    let result = response.result.unwrap();
    assert!(result["output"].as_str().unwrap().contains("Integration test"));
}

#[tokio::test]
async fn test_bridge_server_unknown_method() {
    let server = BridgeServer::new();

    let request = JsonRpcRequest::new(
        json!(3),
        "unknown.method",
        None,
    );

    let response = server.handle_request(request).await;

    // Should return method not found error
    assert!(response.result.is_none());
    assert!(response.error.is_some());
    assert_eq!(response.error.unwrap().code, -32601);
}

#[tokio::test]
async fn test_bridge_server_invalid_params() {
    let server = BridgeServer::new();

    // Tool execution without params
    let request = JsonRpcRequest::new(
        json!(4),
        "tool.execute",
        None,
    );

    let response = server.handle_request(request).await;

    // Should return invalid params error
    assert!(response.result.is_none());
    assert!(response.error.is_some());
    assert_eq!(response.error.unwrap().code, -32602);
}

#[test]
fn test_tokenization_integration() {
    use nanocoder_tokenization::{OpenAiTokenizer, AnthropicEstimator, MessageTokenCounter};

    // Test OpenAI tokenizer
    let openai_tokenizer = OpenAiTokenizer::new("gpt-4").unwrap();
    let openai_counter = MessageTokenCounter::new(openai_tokenizer);

    let message = Message::user("Hello, world!");
    let count = openai_counter.count_message(&message).unwrap();
    assert!(count > 0);

    // Test Anthropic estimator
    let anthropic_estimator = AnthropicEstimator::new("claude-3-5-sonnet-20241022");
    let anthropic_counter = MessageTokenCounter::new(anthropic_estimator);

    let count = anthropic_counter.count_message(&message).unwrap();
    assert!(count > 0);
}

#[test]
fn test_message_workflow() {
    // Simulate a typical message workflow
    let messages = vec![
        Message::system("You are a helpful coding assistant"),
        Message::user("Write a hello world function in Rust"),
        Message::assistant("Here's a hello world function..."),
    ];

    // Verify message structure
    assert_eq!(messages.len(), 3);
    assert!(matches!(messages[0].role, nanocoder_core::MessageRole::System));
    assert!(matches!(messages[1].role, nanocoder_core::MessageRole::User));
    assert!(matches!(messages[2].role, nanocoder_core::MessageRole::Assistant));

    // Test serialization roundtrip
    let json = serde_json::to_string(&messages).unwrap();
    let deserialized: Vec<Message> = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.len(), 3);
}

#[test]
fn test_tool_call_workflow() {
    // Simulate a tool call workflow
    let mut args = HashMap::new();
    args.insert("path".to_string(), json!("src/main.rs"));

    let tool_call = ToolCall {
        id: "call_abc123".to_string(),
        function: ToolFunction {
            name: "read_file".to_string(),
            arguments: args,
        },
    };

    // Test serialization
    let json = serde_json::to_string(&tool_call).unwrap();
    assert!(json.contains("read_file"));
    assert!(json.contains("src/main.rs"));

    // Test deserialization
    let deserialized: ToolCall = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.id, "call_abc123");
    assert_eq!(deserialized.function.name, "read_file");
}

#[test]
fn test_provider_config_workflow() {
    use nanocoder_ai::{Provider, ProviderConfig};

    // Create provider configs
    let openai_config = ProviderConfig::new(Provider::OpenAI, "test-key-123")
        .with_default_model("gpt-4")
        .with_timeout(60);

    let anthropic_config = ProviderConfig::new(Provider::Anthropic, "test-key-456")
        .with_default_model("claude-3-5-sonnet-20241022")
        .with_timeout(60);

    assert_eq!(openai_config.provider, Provider::OpenAI);
    assert_eq!(openai_config.default_model, Some("gpt-4".to_string()));

    assert_eq!(anthropic_config.provider, Provider::Anthropic);
    assert_eq!(anthropic_config.default_model, Some("claude-3-5-sonnet-20241022".to_string()));
}

#[test]
fn test_full_stack_components() {
    use nanocoder_tokenization::{OpenAiTokenizer, AnthropicEstimator};

    // Verify all major components can be instantiated

    // Core types
    let _message = Message::user("test");

    // Tool registry
    let _registry = ToolRegistry::new();

    // Bridge server
    let _server = BridgeServer::new();

    // Tokenizers
    let _openai = OpenAiTokenizer::new("gpt-4").unwrap();
    let _anthropic = AnthropicEstimator::default();

    // All components initialized successfully
}
