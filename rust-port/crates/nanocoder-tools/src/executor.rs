//! Tool execution engine with validation
//!
//! Handles the execution of tool calls with:
//! - Tool lookup from registry
//! - Argument validation
//! - Error handling
//! - Result formatting

use nanocoder_core::{Error, Result, ToolCall, ValidationResult};
use crate::registry::ToolRegistry;
use std::sync::Arc;

/// Execute a tool call using the provided registry
pub async fn execute_tool_call(
    tool_call: &ToolCall,
    registry: &ToolRegistry,
) -> Result<String> {
    // Look up the tool in the registry
    let executor = registry
        .get(&tool_call.function.name)
        .ok_or_else(|| {
            Error::ToolExecution(format!("Tool '{}' not found in registry", tool_call.function.name))
        })?;

    // Convert HashMap to JSON Value for validation and execution
    let args_json = serde_json::to_value(&tool_call.function.arguments)
        .map_err(|e| Error::Serialization(e))?;

    // Validate arguments
    let validation = executor.validate(&args_json).await;
    if let ValidationResult::Invalid(reason) = validation {
        return Err(Error::ToolExecution(format!(
            "Validation failed for tool '{}': {}",
            tool_call.function.name, reason
        )));
    }

    // Execute the tool
    executor.execute(args_json).await
}

/// Execute multiple tool calls in sequence
pub async fn execute_tool_calls(
    tool_calls: &[ToolCall],
    registry: &ToolRegistry,
) -> Vec<Result<String>> {
    let mut results = Vec::new();

    for tool_call in tool_calls {
        let result = execute_tool_call(tool_call, registry).await;
        results.push(result);
    }

    results
}

/// Execute multiple tool calls in parallel
pub async fn execute_tool_calls_parallel(
    tool_calls: &[ToolCall],
    registry: Arc<ToolRegistry>,
) -> Vec<Result<String>> {
    use futures::future::join_all;

    let futures = tool_calls.iter().map(|tool_call| {
        let registry = Arc::clone(&registry);
        let tool_call = tool_call.clone();
        async move {
            execute_tool_call(&tool_call, &registry).await
        }
    });

    join_all(futures).await
}

/// Configuration for tool execution
#[derive(Debug, Clone)]
pub struct ExecutionConfig {
    /// Whether to require confirmation before executing tools
    pub require_confirmation: bool,
    /// Maximum execution time per tool (in milliseconds)
    pub timeout_ms: Option<u64>,
    /// Whether to execute tools in parallel
    pub parallel_execution: bool,
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            require_confirmation: true,
            timeout_ms: Some(30000), // 30 seconds
            parallel_execution: false,
        }
    }
}

/// Tool executor with configuration
pub struct ConfiguredExecutor {
    registry: Arc<ToolRegistry>,
    config: ExecutionConfig,
}

impl ConfiguredExecutor {
    /// Create a new configured executor
    pub fn new(registry: Arc<ToolRegistry>, config: ExecutionConfig) -> Self {
        Self { registry, config }
    }

    /// Execute a single tool call with configuration
    pub async fn execute(&self, tool_call: &ToolCall) -> Result<String> {
        // Check if confirmation is required
        let executor = self.registry.get(&tool_call.function.name).ok_or_else(|| {
            Error::ToolExecution(format!("Tool '{}' not found", tool_call.function.name))
        })?;

        if self.config.require_confirmation && executor.requires_confirmation() {
            // In a real implementation, this would prompt the user
            // For now, we'll just proceed
        }

        // Execute with optional timeout
        if let Some(timeout_ms) = self.config.timeout_ms {
            match tokio::time::timeout(
                tokio::time::Duration::from_millis(timeout_ms),
                execute_tool_call(tool_call, &self.registry),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => Err(Error::ToolExecution(format!(
                    "Tool '{}' execution timed out after {}ms",
                    tool_call.function.name, timeout_ms
                ))),
            }
        } else {
            execute_tool_call(tool_call, &self.registry).await
        }
    }

    /// Execute multiple tool calls with configuration
    pub async fn execute_all(&self, tool_calls: &[ToolCall]) -> Vec<Result<String>> {
        if self.config.parallel_execution {
            execute_tool_calls_parallel(tool_calls, Arc::clone(&self.registry)).await
        } else {
            execute_tool_calls(tool_calls, &self.registry).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use nanocoder_core::{Tool, ToolExecutor, message::ToolFunction};
    use std::collections::HashMap;

    struct MockReadTool;

    #[async_trait]
    impl ToolExecutor for MockReadTool {
        async fn execute(&self, args: serde_json::Value) -> Result<String> {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| Error::ToolExecution("Missing 'path' argument".to_string()))?;
            Ok(format!("Reading file: {}", path))
        }

        fn definition(&self) -> Tool {
            Tool::new("read_file", "Read a file")
                .parameter("path", "string", "File path", true)
                .build()
        }

        fn requires_confirmation(&self) -> bool {
            false
        }
    }

    struct MockFailTool;

    #[async_trait]
    impl ToolExecutor for MockFailTool {
        async fn execute(&self, _args: serde_json::Value) -> Result<String> {
            Err(Error::ToolExecution("Tool failed".to_string()))
        }

        fn definition(&self) -> Tool {
            Tool::new("fail_tool", "Always fails").build()
        }
    }

    #[tokio::test]
    async fn test_execute_tool_call_success() {
        let mut registry = ToolRegistry::new();
        registry.register("read_file", Arc::new(MockReadTool));

        let mut args = HashMap::new();
        args.insert("path".to_string(), serde_json::json!("test.txt"));

        let tool_call = ToolCall {
            id: "call_1".to_string(),
            function: ToolFunction {
                name: "read_file".to_string(),
                arguments: args,
            },
        };

        let result = execute_tool_call(&tool_call, &registry).await.unwrap();
        assert!(result.contains("Reading file: test.txt"));
    }

    #[tokio::test]
    async fn test_execute_tool_call_not_found() {
        let registry = ToolRegistry::new();

        let tool_call = ToolCall {
            id: "call_1".to_string(),
            function: ToolFunction {
                name: "nonexistent_tool".to_string(),
                arguments: HashMap::new(),
            },
        };

        let result = execute_tool_call(&tool_call, &registry).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_execute_multiple_tool_calls() {
        let mut registry = ToolRegistry::new();
        registry.register("read_file", Arc::new(MockReadTool));

        let tool_calls = vec![
            ToolCall {
                id: "call_1".to_string(),
                function: ToolFunction {
                    name: "read_file".to_string(),
                    arguments: {
                        let mut map = HashMap::new();
                        map.insert("path".to_string(), serde_json::json!("file1.txt"));
                        map
                    },
                },
            },
            ToolCall {
                id: "call_2".to_string(),
                function: ToolFunction {
                    name: "read_file".to_string(),
                    arguments: {
                        let mut map = HashMap::new();
                        map.insert("path".to_string(), serde_json::json!("file2.txt"));
                        map
                    },
                },
            },
        ];

        let results = execute_tool_calls(&tool_calls, &registry).await;
        assert_eq!(results.len(), 2);
        assert!(results[0].is_ok());
        assert!(results[1].is_ok());
    }

    #[tokio::test]
    async fn test_configured_executor() {
        let mut registry = ToolRegistry::new();
        registry.register("read_file", Arc::new(MockReadTool));

        let config = ExecutionConfig {
            require_confirmation: false,
            timeout_ms: Some(1000),
            parallel_execution: false,
        };

        let executor = ConfiguredExecutor::new(Arc::new(registry), config);

        let mut args = HashMap::new();
        args.insert("path".to_string(), serde_json::json!("test.txt"));

        let tool_call = ToolCall {
            id: "call_1".to_string(),
            function: ToolFunction {
                name: "read_file".to_string(),
                arguments: args,
            },
        };

        let result = executor.execute(&tool_call).await.unwrap();
        assert!(result.contains("Reading file: test.txt"));
    }

    #[tokio::test]
    async fn test_execute_with_failure() {
        let mut registry = ToolRegistry::new();
        registry.register("fail_tool", Arc::new(MockFailTool));

        let tool_call = ToolCall {
            id: "call_1".to_string(),
            function: ToolFunction {
                name: "fail_tool".to_string(),
                arguments: HashMap::new(),
            },
        };

        let result = execute_tool_call(&tool_call, &registry).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Tool failed"));
    }
}
