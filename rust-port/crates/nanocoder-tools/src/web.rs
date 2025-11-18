//! Web tools for fetching and searching content
//!
//! Provides tools for:
//! - web_fetch: Fetch content from URLs with HTML to markdown conversion
//! - web_search: Search the web (requires search API)

use async_trait::async_trait;
use nanocoder_core::{Result, Tool, ToolExecutor};
use reqwest::Client;
use scraper::{Html, Selector};
use std::time::Duration;

/// Web fetch tool - fetches content from URLs
pub struct WebFetchTool {
    client: Client,
}

impl WebFetchTool {
    /// Create a new web fetch tool
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (compatible; NanocoderBot/1.0)")
            .build()
            .map_err(|e| {
                nanocoder_core::Error::ToolExecution(format!("Failed to create HTTP client: {}", e))
            })?;

        Ok(Self { client })
    }
}

impl Default for WebFetchTool {
    fn default() -> Self {
        Self::new().expect("Failed to create WebFetchTool")
    }
}

#[async_trait]
impl ToolExecutor for WebFetchTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let url = args["url"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'url' argument".to_string()))?;

        let convert_to_markdown = args["convertToMarkdown"]
            .as_bool()
            .unwrap_or(true);

        fetch_url(&self.client, url, convert_to_markdown).await
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "web_fetch",
            "Fetch content from a URL. Returns the page content, optionally converted from HTML to markdown for easier reading."
        )
        .parameter("url", "string", "The URL to fetch", true)
        .parameter("convertToMarkdown", "boolean", "Whether to convert HTML to markdown (default: true)", false)
        .build()
    }

    fn requires_confirmation(&self) -> bool {
        false // Web fetches are generally safe
    }
}

/// Fetch content from a URL
async fn fetch_url(client: &Client, url: &str, convert_to_markdown: bool) -> Result<String> {
    // Validate URL
    let parsed_url = reqwest::Url::parse(url).map_err(|e| {
        nanocoder_core::Error::ToolExecution(format!("Invalid URL '{}': {}", url, e))
    })?;

    // Ensure HTTP(S)
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(nanocoder_core::Error::ToolExecution(
            "URL must use HTTP or HTTPS protocol".to_string(),
        ));
    }

    // Fetch the URL
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to fetch URL: {}", e)))?;

    // Check status
    if !response.status().is_success() {
        return Err(nanocoder_core::Error::ToolExecution(format!(
            "HTTP error {}: {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Unknown error")
        )));
    }

    // Get content type (clone the string to avoid borrow issues)
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    // Get the body
    let body = response
        .text()
        .await
        .map_err(|e| nanocoder_core::Error::ToolExecution(format!("Failed to read response: {}", e)))?;

    // If HTML and conversion requested, convert to markdown
    if convert_to_markdown && (content_type.contains("text/html") || body.trim_start().starts_with("<!DOCTYPE") || body.trim_start().starts_with("<html")) {
        let markdown = html_to_markdown(&body);
        Ok(format!("# Content from {}\n\n{}", url, markdown))
    } else {
        // Return as-is for non-HTML content
        Ok(body)
    }
}

/// Convert HTML to markdown
fn html_to_markdown(html: &str) -> String {
    let document = Html::parse_document(html);
    let mut markdown = String::new();

    // Remove script and style tags
    let body_selector = Selector::parse("body").unwrap();
    let script_selector = Selector::parse("script, style, noscript").unwrap();

    // Try to get body content, fallback to full document
    let root = document
        .select(&body_selector)
        .next()
        .map(|e| Html::parse_fragment(&e.inner_html()))
        .unwrap_or(document);

    // Extract text with basic structure
    extract_text_with_structure(&root, &mut markdown, &script_selector);

    // Clean up excessive whitespace
    let lines: Vec<&str> = markdown
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect();

    lines.join("\n\n")
}

/// Extract text from HTML with basic structure preservation
fn extract_text_with_structure(
    document: &Html,
    output: &mut String,
    skip_selector: &Selector,
) {
    // Selectors for different elements
    let h1 = Selector::parse("h1").unwrap();
    let h2 = Selector::parse("h2").unwrap();
    let h3 = Selector::parse("h3").unwrap();
    let p = Selector::parse("p").unwrap();
    let a = Selector::parse("a").unwrap();
    let li = Selector::parse("li").unwrap();
    let code = Selector::parse("code, pre").unwrap();

    // Process headers
    for element in document.select(&h1) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("# {}\n\n", text.trim()));
            }
        }
    }

    for element in document.select(&h2) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("## {}\n\n", text.trim()));
            }
        }
    }

    for element in document.select(&h3) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("### {}\n\n", text.trim()));
            }
        }
    }

    // Process paragraphs
    for element in document.select(&p) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("{}\n\n", text.trim()));
            }
        }
    }

    // Process links
    for element in document.select(&a) {
        if !has_skipped_ancestor(&element, skip_selector) {
            if let Some(href) = element.value().attr("href") {
                let text = element.text().collect::<String>();
                if !text.trim().is_empty() {
                    output.push_str(&format!("[{}]({})\n\n", text.trim(), href));
                }
            }
        }
    }

    // Process list items
    for element in document.select(&li) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("- {}\n", text.trim()));
            }
        }
    }

    // Process code blocks
    for element in document.select(&code) {
        if !has_skipped_ancestor(&element, skip_selector) {
            let text = element.text().collect::<String>();
            if !text.trim().is_empty() {
                output.push_str(&format!("```\n{}\n```\n\n", text.trim()));
            }
        }
    }
}

/// Check if element has an ancestor that should be skipped
fn has_skipped_ancestor(
    element: &scraper::ElementRef,
    skip_selector: &Selector,
) -> bool {
    let mut current = element.parent();
    while let Some(node) = current {
        if let Some(elem) = scraper::ElementRef::wrap(node) {
            if skip_selector.matches(&elem) {
                return true;
            }
        }
        current = node.parent();
    }
    false
}

/// Web search tool - searches the web
pub struct WebSearchTool;

#[async_trait]
impl ToolExecutor for WebSearchTool {
    async fn execute(&self, args: serde_json::Value) -> Result<String> {
        let query = args["query"]
            .as_str()
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("Missing 'query' argument".to_string()))?;

        // For now, return a message that web search requires configuration
        // In a real implementation, this would integrate with Google Custom Search API,
        // Bing Search API, or similar
        Ok(format!(
            "Web search for '{}' is not yet implemented. This feature requires API key configuration.",
            query
        ))
    }

    fn definition(&self) -> Tool {
        Tool::new(
            "web_search",
            "Search the web for information (requires API configuration)"
        )
        .parameter("query", "string", "The search query", true)
        .parameter("maxResults", "integer", "Maximum number of results to return (default: 5)", false)
        .build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_html_to_markdown_basic() {
        let html = r#"
            <html>
            <body>
                <h1>Title</h1>
                <p>This is a paragraph.</p>
                <h2>Subtitle</h2>
                <p>Another paragraph.</p>
            </body>
            </html>
        "#;

        let markdown = html_to_markdown(html);

        assert!(markdown.contains("# Title"));
        assert!(markdown.contains("## Subtitle"));
        assert!(markdown.contains("This is a paragraph."));
        assert!(markdown.contains("Another paragraph."));
    }

    #[test]
    fn test_html_to_markdown_with_links() {
        let html = r#"
            <html>
            <body>
                <p>Check out <a href="https://example.com">this link</a></p>
            </body>
            </html>
        "#;

        let markdown = html_to_markdown(html);

        assert!(markdown.contains("[this link](https://example.com)"));
    }

    #[test]
    fn test_html_to_markdown_skips_scripts() {
        let html = r#"
            <html>
            <body>
                <p>Visible text</p>
                <script>console.log('hidden');</script>
                <style>.hidden { display: none; }</style>
            </body>
            </html>
        "#;

        let markdown = html_to_markdown(html);

        assert!(markdown.contains("Visible text"));
        assert!(!markdown.contains("console.log"));
        assert!(!markdown.contains("display: none"));
    }

    #[test]
    fn test_html_to_markdown_list() {
        let html = r#"
            <html>
            <body>
                <ul>
                    <li>First item</li>
                    <li>Second item</li>
                    <li>Third item</li>
                </ul>
            </body>
            </html>
        "#;

        let markdown = html_to_markdown(html);

        assert!(markdown.contains("- First item"));
        assert!(markdown.contains("- Second item"));
        assert!(markdown.contains("- Third item"));
    }

    #[test]
    fn test_html_to_markdown_code() {
        let html = r#"
            <html>
            <body>
                <code>let x = 42;</code>
                <pre>function test() {
    return true;
}</pre>
            </body>
            </html>
        "#;

        let markdown = html_to_markdown(html);

        assert!(markdown.contains("```"));
        assert!(markdown.contains("let x = 42;"));
    }

    #[tokio::test]
    async fn test_web_fetch_tool_definition() {
        let tool = WebFetchTool::new().unwrap();
        let def = tool.definition();

        assert_eq!(def.function.name, "web_fetch");
        assert!(!tool.requires_confirmation());
    }
}
