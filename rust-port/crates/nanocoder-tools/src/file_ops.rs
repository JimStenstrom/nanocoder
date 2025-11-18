//! File operation tools
//!
//! Provides tools for reading, creating, and editing files:
//! - read_file: Read file contents with optional line ranges
//! - create_file: Create or overwrite a file
//! - insert_lines: Insert lines at a specific position
//! - replace_lines: Replace a range of lines
//! - delete_lines: Delete a range of lines

use async_trait::async_trait;
use nanocoder_core::{Result, Tool, ToolExecutor};
use std::fs;
use std::path::PathBuf;
use tokio::fs as async_fs;

/// Read file tool - reads file contents with optional line ranges
pub struct ReadFileTool;

#[async_trait]
impl ToolExecutor for ReadFileTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'path' argument".to_string()))?;
        let start_line = args["start_line"].as_u64().map(|n| n as usize);
        let end_line = args["end_line"].as_u64().map(|n| n as usize);

        read_file(path, start_line, end_line).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "read_file",
            "Read the contents of a file from the filesystem. For files over 300 lines, provide start_line and end_line to read specific ranges."
        )
        .parameter("path", "string", "The path to the file to read", true)
        .parameter("start_line", "integer", "The starting line number (1-indexed, inclusive)", false)
        .parameter("end_line", "integer", "The ending line number (1-indexed, inclusive)", false)
        .build()
    }
}

/// Read file implementation
async fn read_file(path: &str, start_line: Option<usize>, end_line: Option<usize>) -> Result<String> {
    let abs_path = fs::canonicalize(path)
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to resolve path '{}': {}", path, e)))?;

    let content = async_fs::read_to_string(&abs_path).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to read file '{}': {}", path, e)))?;

    // Check if file is empty
    if content.is_empty() {
        return Err(nanocoder_core::Error::ToolExecution(
            format!("File \"{}\" exists but is empty (0 tokens)", path)
        ));
    }

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();
    let file_size = content.len();
    let estimated_tokens = (file_size + 3) / 4; // Ceiling division

    // Progressive disclosure: metadata first for files >300 lines without ranges
    if start_line.is_none() && end_line.is_none() && total_lines > 300 {
        // Return metadata only
        let ext = abs_path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let file_type = get_file_type(ext);

        let mut output = format!("File: {}\n", path);
        output.push_str(&format!("Type: {}\n", file_type));
        output.push_str(&format!("Total lines: {}\n", total_lines));
        output.push_str(&format!("Size: {} bytes\n", file_size));
        output.push_str(&format!("Estimated tokens: ~{}\n\n", estimated_tokens));

        if total_lines <= 500 {
            output.push_str("[Medium file - To read specific sections, call read_file with start_line and end_line]\n");
            output.push_str("[To read entire file progressively, make multiple calls:]\n");
            output.push_str(&format!("  - read_file({{path: \"{}\", start_line: 1, end_line: 250}})\n", path));
            output.push_str(&format!("  - read_file({{path: \"{}\", start_line: 251, end_line: {}}})\n", path, total_lines));
        } else {
            output.push_str("[Large file - Choose one approach:]\n");
            output.push_str("[1. Targeted read: Use search_files to find code, then read specific ranges]\n");
            output.push_str("[2. Progressive read: Read file in chunks (recommended chunk size: 200-300 lines)]\n");
            output.push_str(&format!("   Example chunks for {} lines:\n", total_lines));

            let chunk_size = 250;
            let num_chunks = (total_lines + chunk_size - 1) / chunk_size;
            for i in 0..std::cmp::min(num_chunks, 3) {
                let start = i * chunk_size + 1;
                let end = std::cmp::min((i + 1) * chunk_size, total_lines);
                output.push_str(&format!("   - read_file({{path: \"{}\", start_line: {}, end_line: {}}})\n", path, start, end));
            }
            if num_chunks > 3 {
                output.push_str(&format!("   ... and {} more chunks to complete the file\n", num_chunks - 3));
            }
        }

        return Ok(output);
    }

    // Read with line ranges
    let start = start_line.unwrap_or(1).max(1);
    let end = end_line.unwrap_or(total_lines).min(total_lines);

    if start > total_lines {
        return Err(nanocoder_core::Error::ToolExecution(
            format!("start_line {} exceeds total lines {}", start, total_lines)
        ));
    }

    // Build output with line numbers
    let mut output = String::new();
    for (idx, line) in lines.iter().enumerate() {
        let line_num = idx + 1;
        if line_num >= start && line_num <= end {
            output.push_str(&format!("{:4}→{}\n", line_num, line));
        }
    }

    Ok(output)
}

/// Create file tool - creates or overwrites a file
pub struct CreateFileTool;

#[async_trait]
impl ToolExecutor for CreateFileTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'path' argument".to_string()))?;
        let content = args["content"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'content' argument".to_string()))?;

        create_file(path, content).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "create_file",
            "Create a new file with the specified content (overwrites if file exists)"
        )
        .parameter("path", "string", "The path to the file to write", true)
        .parameter("content", "string", "The content to write to the file", true)
        .build()
    }
}

async fn create_file(path: &str, content: &str) -> Result<String> {
    let abs_path = PathBuf::from(path);

    // Create parent directories if they don't exist
    if let Some(parent) = abs_path.parent() {
        async_fs::create_dir_all(parent).await
            .map_err(|e| nanocoder_core::Error::ToolExecution(
                format!("Failed to create parent directories: {}", e)
            ))?;
    }

    async_fs::write(&abs_path, content).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(
            format!("Failed to write file '{}': {}", path, e)
        ))?;

    Ok("File written successfully".to_string())
}

/// Insert lines tool - inserts lines at a specific position
pub struct InsertLinesTool;

#[async_trait]
impl ToolExecutor for InsertLinesTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'path' argument".to_string()))?;
        let line_number = args["line_number"]
            .as_u64()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'line_number' argument".to_string()))? as usize;
        let content = args["content"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'content' argument".to_string()))?;

        insert_lines(path, line_number, content).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "insert_lines",
            "Insert new lines into a file at the specified line number"
        )
        .parameter("path", "string", "The path to the file", true)
        .parameter("line_number", "integer", "The line number where content will be inserted (1-indexed)", true)
        .parameter("content", "string", "The content to insert", true)
        .build()
    }
}

async fn insert_lines(path: &str, line_number: usize, content: &str) -> Result<String> {
    let abs_path = fs::canonicalize(path)
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to resolve path: {}", e)))?;

    let existing_content = async_fs::read_to_string(&abs_path).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to read file: {}", e)))?;

    let mut lines: Vec<&str> = existing_content.lines().collect();

    // Insert at the specified line (1-indexed)
    let insert_pos = if line_number == 0 { 0 } else { line_number - 1 };

    if insert_pos > lines.len() {
        return Err(nanocoder_core::Error::ToolExecution(
            format!("Line number {} exceeds file length {}", line_number, lines.len())
        ));
    }

    // Split the new content into lines and insert
    let new_lines: Vec<&str> = content.lines().collect();
    for (i, line) in new_lines.iter().enumerate() {
        lines.insert(insert_pos + i, line);
    }

    let new_content = lines.join("\n") + "\n";
    async_fs::write(&abs_path, new_content).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to write file: {}", e)))?;

    Ok(format!("Inserted {} lines at line {}", new_lines.len(), line_number))
}

/// Replace lines tool - replaces a range of lines
pub struct ReplaceLinesTool;

#[async_trait]
impl ToolExecutor for ReplaceLinesTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'path' argument".to_string()))?;
        let start_line = args["start_line"]
            .as_u64()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'start_line' argument".to_string()))? as usize;
        let end_line = args["end_line"]
            .as_u64()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'end_line' argument".to_string()))? as usize;
        let content = args["content"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'content' argument".to_string()))?;

        replace_lines(path, start_line, end_line, content).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "replace_lines",
            "Replace a range of lines in a file with new content"
        )
        .parameter("path", "string", "The path to the file", true)
        .parameter("start_line", "integer", "The starting line number (1-indexed, inclusive)", true)
        .parameter("end_line", "integer", "The ending line number (1-indexed, inclusive)", true)
        .parameter("content", "string", "The new content to replace the lines with", true)
        .build()
    }
}

async fn replace_lines(path: &str, start_line: usize, end_line: usize, content: &str) -> Result<String> {
    let abs_path = fs::canonicalize(path)
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to resolve path: {}", e)))?;

    let existing_content = async_fs::read_to_string(&abs_path).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to read file: {}", e)))?;

    let mut lines: Vec<&str> = existing_content.lines().collect();

    if start_line < 1 || end_line < start_line || end_line > lines.len() {
        return Err(nanocoder_core::Error::ToolExecution(
            format!("Invalid line range: {}-{} for file with {} lines", start_line, end_line, lines.len())
        ));
    }

    // Remove old lines
    let start_idx = start_line - 1;
    let end_idx = end_line - 1;
    lines.drain(start_idx..=end_idx);

    // Insert new lines
    let new_lines: Vec<&str> = content.lines().collect();
    for (i, line) in new_lines.iter().enumerate() {
        lines.insert(start_idx + i, line);
    }

    let new_content = lines.join("\n") + "\n";
    async_fs::write(&abs_path, new_content).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to write file: {}", e)))?;

    Ok(format!("Replaced lines {}-{} with {} new lines", start_line, end_line, new_lines.len()))
}

/// Delete lines tool - deletes a range of lines
pub struct DeleteLinesTool;

#[async_trait]
impl ToolExecutor for DeleteLinesTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'path' argument".to_string()))?;
        let start_line = args["start_line"]
            .as_u64()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'start_line' argument".to_string()))? as usize;
        let end_line = args["end_line"]
            .as_u64()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'end_line' argument".to_string()))? as usize;

        delete_lines(path, start_line, end_line).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "delete_lines",
            "Delete a range of lines from a file"
        )
        .parameter("path", "string", "The path to the file", true)
        .parameter("start_line", "integer", "The starting line number (1-indexed, inclusive)", true)
        .parameter("end_line", "integer", "The ending line number (1-indexed, inclusive)", true)
        .build()
    }
}

async fn delete_lines(path: &str, start_line: usize, end_line: usize) -> Result<String> {
    let abs_path = fs::canonicalize(path)
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to resolve path: {}", e)))?;

    let existing_content = async_fs::read_to_string(&abs_path).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to read file: {}", e)))?;

    let mut lines: Vec<&str> = existing_content.lines().collect();

    if start_line < 1 || end_line < start_line || end_line > lines.len() {
        return Err(nanocoder_core::Error::ToolExecution(
            format!("Invalid line range: {}-{} for file with {} lines", start_line, end_line, lines.len())
        ));
    }

    // Remove lines
    let start_idx = start_line - 1;
    let end_idx = end_line - 1;
    let num_deleted = end_idx - start_idx + 1;
    lines.drain(start_idx..=end_idx);

    let new_content = lines.join("\n") + "\n";
    async_fs::write(&abs_path, new_content).await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to write file: {}", e)))?;

    Ok(format!("Deleted {} lines ({}-{})", num_deleted, start_line, end_line))
}

/// Get file type from extension
fn get_file_type(ext: &str) -> String {
    let ext_lower = ext.to_lowercase();
    match ext_lower.as_str() {
        "ts" => "TypeScript".to_string(),
        "tsx" => "TypeScript React".to_string(),
        "js" => "JavaScript".to_string(),
        "jsx" => "JavaScript React".to_string(),
        "py" => "Python".to_string(),
        "go" => "Go".to_string(),
        "rs" => "Rust".to_string(),
        "java" => "Java".to_string(),
        "cpp" | "cc" | "cxx" => "C++".to_string(),
        "c" | "h" => "C".to_string(),
        "md" => "Markdown".to_string(),
        "json" => "JSON".to_string(),
        "yaml" | "yml" => "YAML".to_string(),
        "toml" => "TOML".to_string(),
        "html" | "htm" => "HTML".to_string(),
        "css" => "CSS".to_string(),
        "scss" | "sass" => "SCSS".to_string(),
        "sh" | "bash" => "Shell".to_string(),
        _ => ext.to_uppercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[tokio::test]
    async fn test_read_file() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "line 1").unwrap();
        writeln!(file, "line 2").unwrap();
        writeln!(file, "line 3").unwrap();

        let result = read_file(file.path().to_str().unwrap(), Some(1), Some(2)).await.unwrap();
        assert!(result.contains("line 1"));
        assert!(result.contains("line 2"));
        assert!(!result.contains("line 3"));
    }

    #[tokio::test]
    async fn test_create_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        create_file(file_path.to_str().unwrap(), "test content").await.unwrap();

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "test content");
    }

    #[tokio::test]
    async fn test_insert_lines() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "line 1").unwrap();
        writeln!(file, "line 2").unwrap();

        insert_lines(file.path().to_str().unwrap(), 2, "inserted line").await.unwrap();

        let content = std::fs::read_to_string(file.path()).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "line 1");
        assert_eq!(lines[1], "inserted line");
        assert_eq!(lines[2], "line 2");
    }

    #[tokio::test]
    async fn test_replace_lines() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "line 1").unwrap();
        writeln!(file, "line 2").unwrap();
        writeln!(file, "line 3").unwrap();

        replace_lines(file.path().to_str().unwrap(), 2, 2, "replaced").await.unwrap();

        let content = std::fs::read_to_string(file.path()).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "line 1");
        assert_eq!(lines[1], "replaced");
        assert_eq!(lines[2], "line 3");
    }

    #[tokio::test]
    async fn test_delete_lines() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "line 1").unwrap();
        writeln!(file, "line 2").unwrap();
        writeln!(file, "line 3").unwrap();

        delete_lines(file.path().to_str().unwrap(), 2, 2).await.unwrap();

        let content = std::fs::read_to_string(file.path()).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "line 1");
        assert_eq!(lines[1], "line 3");
    }
}
