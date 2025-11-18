use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::Result;

/// Tool parameter schema (JSON Schema subset)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameterSchema {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub param_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(flatten)]
    pub additional: HashMap<String, serde_json::Value>,
}

/// Tool parameters definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameters {
    #[serde(rename = "type")]
    pub param_type: String, // Always "object" for function parameters
    pub properties: HashMap<String, ToolParameterSchema>,
    pub required: Vec<String>,
}

/// Tool function definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: ToolParameters,
}

/// Tool definition in OpenAI format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: String, // Always "function"
    pub function: ToolFunctionDef,
}

impl Tool {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> ToolBuilder {
        ToolBuilder {
            name: name.into(),
            description: description.into(),
            properties: HashMap::new(),
            required: Vec::new(),
        }
    }
}

/// Builder for creating tools
pub struct ToolBuilder {
    name: String,
    description: String,
    properties: HashMap<String, ToolParameterSchema>,
    required: Vec<String>,
}

impl ToolBuilder {
    /// Add a parameter to the tool
    pub fn parameter(
        mut self,
        name: impl Into<String>,
        param_type: impl Into<String>,
        description: impl Into<String>,
        required: bool,
    ) -> Self {
        let name = name.into();
        self.properties.insert(
            name.clone(),
            ToolParameterSchema {
                param_type: Some(param_type.into()),
                description: Some(description.into()),
                additional: HashMap::new(),
            },
        );
        if required {
            self.required.push(name);
        }
        self
    }

    /// Build the tool definition
    pub fn build(self) -> Tool {
        Tool {
            tool_type: "function".to_string(),
            function: ToolFunctionDef {
                name: self.name,
                description: self.description,
                parameters: ToolParameters {
                    param_type: "object".to_string(),
                    properties: self.properties,
                    required: self.required,
                },
            },
        }
    }
}

/// Validation result for tool execution
#[derive(Debug, Clone)]
pub enum ValidationResult {
    Valid,
    Invalid(String),
}

impl ValidationResult {
    pub fn is_valid(&self) -> bool {
        matches!(self, ValidationResult::Valid)
    }

    pub fn error_message(&self) -> Option<&str> {
        match self {
            ValidationResult::Invalid(msg) => Some(msg),
            _ => None,
        }
    }
}

/// Trait for tool execution
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Execute the tool with the given arguments
    async fn execute(&self, args: serde_json::Value) -> Result<String>;

    /// Validate the arguments before execution (optional)
    async fn validate(&self, _args: &serde_json::Value) -> ValidationResult {
        ValidationResult::Valid
    }

    /// Get the tool definition
    fn definition(&self) -> Tool;

    /// Whether this tool requires user confirmation (default: true)
    fn requires_confirmation(&self) -> bool {
        true
    }
}

/// Complete tool entry for the registry
pub struct ToolEntry {
    pub name: String,
    pub definition: Tool,
    pub executor: Box<dyn ToolExecutor>,
}

impl ToolEntry {
    pub fn new(name: impl Into<String>, definition: Tool, executor: Box<dyn ToolExecutor>) -> Self {
        Self {
            name: name.into(),
            definition,
            executor,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_builder() {
        let tool = Tool::new("read_file", "Read a file from the filesystem")
            .parameter("path", "string", "Path to the file", true)
            .parameter("encoding", "string", "File encoding", false)
            .build();

        assert_eq!(tool.tool_type, "function");
        assert_eq!(tool.function.name, "read_file");
        assert_eq!(tool.function.parameters.properties.len(), 2);
        assert_eq!(tool.function.parameters.required.len(), 1);
        assert!(tool.function.parameters.required.contains(&"path".to_string()));
    }

    #[test]
    fn test_validation_result() {
        let valid = ValidationResult::Valid;
        assert!(valid.is_valid());
        assert!(valid.error_message().is_none());

        let invalid = ValidationResult::Invalid("error".to_string());
        assert!(!invalid.is_valid());
        assert_eq!(invalid.error_message(), Some("error"));
    }

    #[test]
    fn test_tool_serialization() {
        let tool = Tool::new("test_tool", "A test tool")
            .parameter("arg1", "string", "First argument", true)
            .build();

        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("\"type\":\"function\""));
        assert!(json.contains("\"name\":\"test_tool\""));
    }
}
