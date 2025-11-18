//! Tool call parsers for XML and JSON formats
//!
//! Provides parsers for extracting tool calls from LLM responses in:
//! - XML format (for models without native tool calling)
//! - JSON format (OpenAI-compatible function calling)

use crate::{Error, Result, ToolCall, message::ToolFunction};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;

/// Parse tool calls from XML format
///
/// Expected format:
/// ```xml
/// <tool_call>
///   <name>tool_name</name>
///   <arguments>{"key": "value"}</arguments>
/// </tool_call>
/// ```
pub fn parse_xml_tool_calls(text: &str) -> Result<Vec<ToolCall>> {
    let mut tool_calls = Vec::new();

    // Regex to match tool_call blocks ((?s) enables . to match newlines)
    let tool_call_re = Regex::new(r"(?s)<tool_call>(.*?)</tool_call>")
        .map_err(|e| Error::Parsing(format!("Failed to compile regex: {}", e)))?;

    // Regex to extract name and arguments ((?s) enables . to match newlines)
    let name_re = Regex::new(r"(?s)<name>(.*?)</name>")
        .map_err(|e| Error::Parsing(format!("Failed to compile regex: {}", e)))?;
    let args_re = Regex::new(r"(?s)<arguments>(.*?)</arguments>")
        .map_err(|e| Error::Parsing(format!("Failed to compile regex: {}", e)))?;

    for cap in tool_call_re.captures_iter(text) {
        let block = &cap[1];

        // Extract tool name
        let name = name_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
            .ok_or_else(|| Error::Parsing("Missing <name> in tool_call".to_string()))?;

        // Extract arguments
        let args_str = args_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim())
            .unwrap_or("{}");

        // Parse JSON arguments
        let arguments_value: Value = serde_json::from_str(args_str)
            .map_err(|e| Error::Parsing(format!("Invalid JSON in arguments: {}", e)))?;

        // Convert Value to HashMap
        let arguments = if let Value::Object(map) = arguments_value {
            map.into_iter().collect()
        } else {
            HashMap::new()
        };

        // Generate a unique ID for this tool call
        let id = format!("call_{}", uuid::Uuid::new_v4());

        tool_calls.push(ToolCall {
            id,
            function: ToolFunction {
                name,
                arguments,
            },
        });
    }

    Ok(tool_calls)
}

/// Parse tool calls from JSON format (OpenAI-compatible)
///
/// Expected format:
/// ```json
/// {
///   "id": "call_abc123",
///   "type": "function",
///   "function": {
///     "name": "tool_name",
///     "arguments": "{\"key\": \"value\"}"
///   }
/// }
/// ```
pub fn parse_json_tool_calls(tool_calls_json: &Value) -> Result<Vec<ToolCall>> {
    let mut tool_calls = Vec::new();

    // Handle both single object and array of tool calls
    let calls_array = if tool_calls_json.is_array() {
        tool_calls_json.as_array()
            .ok_or_else(|| Error::Parsing("Expected array of tool calls".to_string()))?
    } else {
        // Wrap single call in array for uniform processing
        return Ok(vec![parse_single_json_tool_call(tool_calls_json)?]);
    };

    for call_value in calls_array {
        tool_calls.push(parse_single_json_tool_call(call_value)?);
    }

    Ok(tool_calls)
}

/// Parse a single JSON tool call
fn parse_single_json_tool_call(call: &Value) -> Result<ToolCall> {
    // Extract id
    let id = call["id"]
        .as_str()
        .ok_or_else(|| Error::Parsing("Missing 'id' in tool call".to_string()))?
        .to_string();

    // Extract function object
    let function_obj = call["function"]
        .as_object()
        .ok_or_else(|| Error::Parsing("Missing 'function' in tool call".to_string()))?;

    // Extract name
    let name = function_obj["name"]
        .as_str()
        .ok_or_else(|| Error::Parsing("Missing 'name' in function".to_string()))?
        .to_string();

    // Extract and parse arguments
    let args_str = function_obj["arguments"]
        .as_str()
        .ok_or_else(|| Error::Parsing("Missing 'arguments' in function".to_string()))?;

    let arguments_value: Value = serde_json::from_str(args_str)
        .map_err(|e| Error::Parsing(format!("Invalid JSON in arguments: {}", e)))?;

    // Convert Value to HashMap
    let arguments = if let Value::Object(map) = arguments_value {
        map.into_iter().collect()
    } else {
        HashMap::new()
    };

    Ok(ToolCall {
        id,
        function: ToolFunction {
            name,
            arguments,
        },
    })
}

/// Extract tool calls from a message content
///
/// Attempts to detect and parse tool calls in both XML and JSON formats
pub fn extract_tool_calls(content: &str) -> Result<Vec<ToolCall>> {
    // First try XML format
    if content.contains("<tool_call>") {
        return parse_xml_tool_calls(content);
    }

    // Try JSON format by looking for JSON objects
    if let Ok(json) = serde_json::from_str::<Value>(content) {
        if json.is_object() && (json.get("function").is_some() || json.get("id").is_some()) {
            return parse_json_tool_calls(&json);
        }
        if json.is_array() {
            return parse_json_tool_calls(&json);
        }
    }

    // No tool calls found
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xml_tool_calls_single() {
        let xml = r#"
Some text before
<tool_call>
  <name>read_file</name>
  <arguments>{"path": "src/main.rs"}</arguments>
</tool_call>
Some text after
"#;

        let calls = parse_xml_tool_calls(xml).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "read_file");
        assert_eq!(calls[0].function.arguments["path"], "src/main.rs");
    }

    #[test]
    fn test_parse_xml_tool_calls_multiple() {
        let xml = r#"
<tool_call>
  <name>create_file</name>
  <arguments>{"path": "test.txt", "content": "hello"}</arguments>
</tool_call>
<tool_call>
  <name>read_file</name>
  <arguments>{"path": "test.txt"}</arguments>
</tool_call>
"#;

        let calls = parse_xml_tool_calls(xml).unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].function.name, "create_file");
        assert_eq!(calls[1].function.name, "read_file");
    }

    #[test]
    fn test_parse_xml_tool_calls_empty_args() {
        let xml = r#"
<tool_call>
  <name>list_tools</name>
  <arguments>{}</arguments>
</tool_call>
"#;

        let calls = parse_xml_tool_calls(xml).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "list_tools");
        assert!(calls[0].function.arguments.is_empty());
    }

    #[test]
    fn test_parse_json_tool_calls_single() {
        let json = serde_json::json!({
            "id": "call_123",
            "type": "function",
            "function": {
                "name": "read_file",
                "arguments": "{\"path\": \"src/main.rs\"}"
            }
        });

        let calls = parse_json_tool_calls(&json).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call_123");
        assert_eq!(calls[0].function.name, "read_file");
        assert_eq!(calls[0].function.arguments["path"], "src/main.rs");
    }

    #[test]
    fn test_parse_json_tool_calls_array() {
        let json = serde_json::json!([
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "create_file",
                    "arguments": "{\"path\": \"test.txt\"}"
                }
            },
            {
                "id": "call_2",
                "type": "function",
                "function": {
                    "name": "read_file",
                    "arguments": "{\"path\": \"test.txt\"}"
                }
            }
        ]);

        let calls = parse_json_tool_calls(&json).unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].function.name, "create_file");
        assert_eq!(calls[1].function.name, "read_file");
    }

    #[test]
    fn test_extract_tool_calls_xml() {
        let content = r#"
I'll read the file for you.
<tool_call>
  <name>read_file</name>
  <arguments>{"path": "test.txt"}</arguments>
</tool_call>
"#;

        let calls = extract_tool_calls(content).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "read_file");
    }

    #[test]
    fn test_extract_tool_calls_none() {
        let content = "This is just regular text with no tool calls.";

        let calls = extract_tool_calls(content).unwrap();
        assert_eq!(calls.len(), 0);
    }

    #[test]
    fn test_parse_xml_missing_name() {
        let xml = r#"
<tool_call>
  <arguments>{"path": "test.txt"}</arguments>
</tool_call>
"#;

        let result = parse_xml_tool_calls(xml);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Missing <name>"));
    }

    #[test]
    fn test_parse_json_missing_id() {
        let json = serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "arguments": "{\"path\": \"test.txt\"}"
            }
        });

        let result = parse_json_tool_calls(&json);
        assert!(result.is_err());
    }
}
