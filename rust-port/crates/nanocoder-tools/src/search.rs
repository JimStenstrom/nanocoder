//! Search tools for finding files and searching content
//!
//! Provides tools for:
//! - find_files: Find files matching glob patterns
//! - search_file_contents: Search for text within files (grep/ripgrep)

use async_trait::async_trait;
use globset::{Glob, GlobSetBuilder};
use ignore::WalkBuilder;
use nanocoder_core::{Result, Tool, ToolExecutor};
use std::env;
use std::path::Path;
use tokio::process::Command;

/// Find files tool - searches for files matching glob patterns
pub struct FindFilesTool;

#[async_trait]
impl ToolExecutor for FindFilesTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let pattern = args["pattern"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'pattern' argument".to_string()))?;
        let max_results = args["maxResults"]
            .as_u64()
            .map(|n| n as usize)
            .unwrap_or(50)
            .min(100);

        find_files(pattern, max_results).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "find_files",
            "Find files and directories by path pattern or name. Use glob patterns like \"*.tsx\", \"**/*.ts\", \"src/**/*.js\", or \"*.{ts,tsx}\". Returns a list of matching file and directory paths. Does NOT search file contents - use search_file_contents for that."
        )
        .parameter("pattern", "string", "Glob pattern to match file and directory paths. Examples: \"*.tsx\" (all .tsx files), \"src/**/*.ts\" (all .ts in src/), \"components/**\" (all files/dirs in components/), \"*.{ts,tsx}\" (multiple extensions)", true)
        .parameter("maxResults", "integer", "Maximum number of results to return (default: 50, max: 100)", false)
        .build()
    }
}

/// Find files matching a glob pattern
async fn find_files(pattern: &str, max_results: usize) -> Result<String> {
    let cwd = env::current_dir()
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to get current directory: {}", e)))?;

    // Build glob matcher
    let glob = Glob::new(pattern)
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Invalid glob pattern: {}", e)))?;
    let mut builder = GlobSetBuilder::new();
    builder.add(glob);
    let globset = builder.build()
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to build glob: {}", e)))?;

    // Use ignore crate to walk directory tree (respects .gitignore)
    let walker = WalkBuilder::new(&cwd)
        .hidden(false) // Include hidden files
        .git_ignore(true) // Respect .gitignore
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .build();

    let mut matches = Vec::new();
    for entry in walker {
        if matches.len() >= max_results {
            break;
        }

        if let Ok(entry) = entry {
            let path = entry.path();

            // Get relative path from cwd
            if let Ok(rel_path) = path.strip_prefix(&cwd) {
                // Check if path matches glob
                if globset.is_match(rel_path) {
                    matches.push(rel_path.to_string_lossy().to_string());
                }
            }
        }
    }

    let truncated = matches.len() >= max_results;

    if matches.is_empty() {
        return Ok(format!("No files or directories found matching pattern \"{}\"", pattern));
    }

    let mut output = format!(
        "Found {} match{}{}:\n\n",
        matches.len(),
        if matches.len() == 1 { "" } else { "es" },
        if truncated { format!(" (showing first {})", max_results) } else { String::new() }
    );
    output.push_str(&matches.join("\n"));

    Ok(output)
}

/// Search file contents tool - searches for text within files
pub struct SearchFileContentsTool;

#[async_trait]
impl ToolExecutor for SearchFileContentsTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let query = args["query"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'query' argument".to_string()))?;
        let max_results = args["maxResults"]
            .as_u64()
            .map(|n| n as usize)
            .unwrap_or(30)
            .min(100);
        let case_sensitive = args["caseSensitive"]
            .as_bool()
            .unwrap_or(false);

        search_file_contents(query, max_results, case_sensitive).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "search_file_contents",
            "Search for text within file contents using ripgrep/grep. Returns matching lines with file paths and line numbers. Use this to find code, not for finding files by name (use find_files for that)."
        )
        .parameter("query", "string", "The text to search for in file contents", true)
        .parameter("maxResults", "integer", "Maximum number of matches to return (default: 30, max: 100)", false)
        .parameter("caseSensitive", "boolean", "Whether the search should be case-sensitive (default: false)", false)
        .build()
    }
}

/// Search file contents using ripgrep or grep
async fn search_file_contents(query: &str, max_results: usize, case_sensitive: bool) -> Result<String> {
    let cwd = env::current_dir()
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to get current directory: {}", e)))?;

    // Try ripgrep first (faster), fall back to grep
    let output = if which::which("rg").is_ok() {
        search_with_ripgrep(query, &cwd, max_results, case_sensitive).await?
    } else if which::which("grep").is_ok() {
        search_with_grep(query, &cwd, max_results, case_sensitive).await?
    } else {
        return Err(nanocoder_core::Error::ToolExecution(
            "Neither ripgrep (rg) nor grep found in PATH. Please install one of them.".to_string()
        ));
    };

    Ok(output)
}

/// Search using ripgrep
async fn search_with_ripgrep(query: &str, cwd: &Path, max_results: usize, case_sensitive: bool) -> Result<String> {
    let mut cmd = Command::new("rg");
    cmd.current_dir(cwd);
    cmd.arg("--line-number"); // Show line numbers
    cmd.arg("--no-heading"); // Don't group by file
    cmd.arg("--color=never"); // No color codes
    cmd.arg("--max-count").arg(max_results.to_string()); // Limit matches per file

    if !case_sensitive {
        cmd.arg("--ignore-case");
    }

    cmd.arg(query);

    let output = cmd.output().await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to run ripgrep: {}", e)))?;

    if !output.status.success() {
        // rg returns exit code 1 when no matches found
        if output.status.code() == Some(1) {
            return Ok(format!("No matches found for \"{}\"", query));
        }
        return Err(nanocoder_core::Error::ToolExecution(
            format!("ripgrep failed: {}", String::from_utf8_lossy(&output.stderr))
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    format_search_results(&stdout, query, max_results)
}

/// Search using grep
async fn search_with_grep(query: &str, cwd: &Path, max_results: usize, case_sensitive: bool) -> Result<String> {
    let mut cmd = Command::new("grep");
    cmd.current_dir(cwd);
    cmd.arg("-rn"); // Recursive with line numbers

    if !case_sensitive {
        cmd.arg("-i");
    }

    // Exclude common directories
    cmd.arg("--exclude-dir=node_modules");
    cmd.arg("--exclude-dir=.git");
    cmd.arg("--exclude-dir=dist");
    cmd.arg("--exclude-dir=build");
    cmd.arg("--exclude-dir=coverage");
    cmd.arg("--exclude-dir=.next");
    cmd.arg("--exclude-dir=.nuxt");
    cmd.arg("--exclude-dir=out");
    cmd.arg("--exclude-dir=.cache");

    cmd.arg(query);
    cmd.arg(".");

    let output = cmd.output().await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to run grep: {}", e)))?;

    if !output.status.success() {
        // grep returns exit code 1 when no matches found
        if output.status.code() == Some(1) {
            return Ok(format!("No matches found for \"{}\"", query));
        }
        return Err(nanocoder_core::Error::ToolExecution(
            format!("grep failed: {}", String::from_utf8_lossy(&output.stderr))
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    format_search_results(&stdout, query, max_results)
}

/// Format search results from grep/ripgrep output
fn format_search_results(stdout: &str, query: &str, max_results: usize) -> Result<String> {
    let lines: Vec<&str> = stdout.trim().split('\n').filter(|l| !l.is_empty()).collect();

    if lines.is_empty() {
        return Ok(format!("No matches found for \"{}\"", query));
    }

    let truncated = lines.len() > max_results;
    let display_lines = if truncated {
        &lines[..max_results]
    } else {
        &lines[..]
    };

    let mut output = format!(
        "Found {} match{}{}:\n\n",
        display_lines.len(),
        if display_lines.len() == 1 { "" } else { "es" },
        if truncated { format!(" (showing first {})", max_results) } else { String::new() }
    );

    for line in display_lines {
        // Parse format: file:line:content or ./file:line:content
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() >= 3 {
            let file = parts[0].trim_start_matches("./");
            let line_num = parts[1];
            let content = parts[2].trim();

            output.push_str(&format!("{}:{}\n", file, line_num));
            output.push_str(&format!("  {}\n\n", content));
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    #[tokio::test]
    async fn test_find_files_simple_pattern() {
        let temp_dir = TempDir::new().unwrap();

        // Create some test files
        fs::write(temp_dir.path().join("test1.rs"), "content").unwrap();
        fs::write(temp_dir.path().join("test2.rs"), "content").unwrap();
        fs::write(temp_dir.path().join("test.txt"), "content").unwrap();

        std::env::set_current_dir(temp_dir.path()).unwrap();

        let result = find_files("*.rs", 10).await.unwrap();

        assert!(result.contains("test1.rs"));
        assert!(result.contains("test2.rs"));
        assert!(!result.contains("test.txt"));
    }

    #[tokio::test]
    async fn test_find_files_no_matches() {
        let temp_dir = TempDir::new().unwrap();
        std::env::set_current_dir(temp_dir.path()).unwrap();

        let result = find_files("*.nonexistent", 10).await.unwrap();

        assert!(result.contains("No files or directories found"));
    }
}
