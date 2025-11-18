//! Bash command execution tool
//!
//! Executes bash commands and returns stdout/stderr output

use async_trait::async_trait;
use nanocoder_core::{Result, Tool, ToolExecutor};
use tokio::process::Command;

/// Execute bash tool - runs bash commands
pub struct ExecuteBashTool;

#[async_trait]
impl ToolExecutor for ExecuteBashTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let command = args["command"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'command' argument".to_string()))?;

        execute_bash(command).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "execute_bash",
            "Execute a bash command and return the output (use for running commands)"
        )
        .parameter("command", "string", "The bash command to execute", true)
        .build()
    }
}

/// Execute a bash command
async fn execute_bash(command: &str) -> Result<String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(command)
        .output()
        .await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to execute command: {}", e)))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Format output
    let mut result = String::new();

    // Always include exit code
    result.push_str(&format!("EXIT_CODE: {}\n", exit_code));

    // Include stderr if present
    if !stderr.is_empty() {
        result.push_str("STDERR:\n");
        result.push_str(&stderr);
        result.push_str("\nSTDOUT:\n");
        result.push_str(&stdout);
    } else {
        result.push_str(&stdout);
    }

    // Limit output to 2000 characters to prevent overwhelming the LLM
    if result.len() > 2000 {
        result.truncate(2000);
        result.push_str("\n... [Output truncated. Use more specific commands to see full output]");
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_execute_bash_success() {
        let result = execute_bash("echo 'hello world'").await.unwrap();
        assert!(result.contains("hello world"));
        assert!(result.contains("EXIT_CODE: 0"));
    }

    #[tokio::test]
    async fn test_execute_bash_with_stderr() {
        let result = execute_bash("echo 'error' >&2").await.unwrap();
        assert!(result.contains("STDERR"));
        assert!(result.contains("error"));
    }

    #[tokio::test]
    async fn test_execute_bash_exit_code() {
        let result = execute_bash("exit 42").await.unwrap();
        assert!(result.contains("EXIT_CODE: 42"));
    }

    #[tokio::test]
    async fn test_execute_bash_truncation() {
        // Generate output > 2000 characters
        let result = execute_bash("for i in $(seq 1 200); do echo 'This is a long line of text'; done").await.unwrap();

        // Should be truncated
        assert!(result.len() <= 2100); // 2000 + truncation message
        if result.len() > 2000 {
            assert!(result.contains("Output truncated"));
        }
    }
}
