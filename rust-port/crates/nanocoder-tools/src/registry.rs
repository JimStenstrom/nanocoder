//! Tool registry for managing static and MCP tools

use nanocoder_core::{Result, Tool, ToolExecutor};
use std::collections::HashMap;
use std::sync::Arc;

/// Registry for managing all available tools (static and MCP)
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn ToolExecutor>>,
}

impl ToolRegistry {
    /// Create a new empty tool registry
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Register a tool in the registry
    pub fn register(&mut self, name: impl Into<String>, executor: Arc<dyn ToolExecutor>) {
        self.tools.insert(name.into(), executor);
    }

    /// Get a tool by name
    pub fn get(&self, name: &str) -> Option<&Arc<dyn ToolExecutor>> {
        self.tools.get(name)
    }

    /// Check if a tool exists
    pub fn has(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// Get all tool names
    pub fn list_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Get all tool definitions (for passing to LLM)
    pub fn get_definitions(&self) -> Vec<Tool> {
        self.tools
            .values()
            .map(|executor| executor.definition())
            .collect()
    }

    /// Get the number of registered tools
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    /// Check if registry is empty
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    /// Remove a tool from the registry
    pub fn remove(&mut self, name: &str) -> Option<Arc<dyn ToolExecutor>> {
        self.tools.remove(name)
    }

    /// Clear all tools from the registry
    pub fn clear(&mut self) {
        self.tools.clear();
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for creating a tool registry with pre-registered tools
pub struct ToolRegistryBuilder {
    registry: ToolRegistry,
}

impl ToolRegistryBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            registry: ToolRegistry::new(),
        }
    }

    /// Register a tool
    pub fn with_tool(mut self, name: impl Into<String>, executor: Arc<dyn ToolExecutor>) -> Self {
        self.registry.register(name, executor);
        self
    }

    /// Build the registry
    pub fn build(self) -> ToolRegistry {
        self.registry
    }
}

impl Default for ToolRegistryBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nanocoder_core::Tool;
    use async_trait::async_trait;

    struct MockTool;

    #[async_trait]
    impl ToolExecutor for MockTool {
        async fn execute(&self, _args: serde_json::Value) -> Result<String> {
            Ok("mock result".to_string())
        }

        fn definition(&self) -> Tool {
            Tool::new("mock_tool", "A mock tool for testing")
                .parameter("arg1", "string", "First argument", true)
                .build()
        }
    }

    #[test]
    fn test_registry_register_and_get() {
        let mut registry = ToolRegistry::new();
        let tool = Arc::new(MockTool);

        registry.register("mock_tool", tool.clone());

        assert!(registry.has("mock_tool"));
        assert!(registry.get("mock_tool").is_some());
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn test_registry_remove() {
        let mut registry = ToolRegistry::new();
        registry.register("mock_tool", Arc::new(MockTool));

        assert!(registry.has("mock_tool"));
        registry.remove("mock_tool");
        assert!(!registry.has("mock_tool"));
    }

    #[test]
    fn test_registry_list_names() {
        let mut registry = ToolRegistry::new();
        registry.register("tool1", Arc::new(MockTool));
        registry.register("tool2", Arc::new(MockTool));

        let names = registry.list_names();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"tool1".to_string()));
        assert!(names.contains(&"tool2".to_string()));
    }

    #[test]
    fn test_registry_builder() {
        let registry = ToolRegistryBuilder::new()
            .with_tool("tool1", Arc::new(MockTool))
            .with_tool("tool2", Arc::new(MockTool))
            .build();

        assert_eq!(registry.len(), 2);
        assert!(registry.has("tool1"));
        assert!(registry.has("tool2"));
    }

    #[test]
    fn test_get_definitions() {
        let mut registry = ToolRegistry::new();
        registry.register("mock_tool", Arc::new(MockTool));

        let definitions = registry.get_definitions();
        assert_eq!(definitions.len(), 1);
        assert_eq!(definitions[0].function.name, "mock_tool");
    }
}
