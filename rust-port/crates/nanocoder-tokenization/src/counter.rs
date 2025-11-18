//! Message-level token counting

use crate::tokenizer::Tokenizer;
use nanocoder_core::{Message, Result, Tool};

/// Counter for messages and tools
pub struct MessageTokenCounter<T: Tokenizer> {
    tokenizer: T,
}

impl<T: Tokenizer> MessageTokenCounter<T> {
    /// Create a new message token counter
    pub fn new(tokenizer: T) -> Self {
        Self { tokenizer }
    }

    /// Count tokens in a single message
    pub fn count_message(&self, message: &Message) -> Result<usize> {
        let mut total = 0;

        // Count role (adds overhead in API format)
        total += 4; // Approximate overhead for role formatting

        // Count content
        if !message.content.is_empty() {
            total += self.tokenizer.count_tokens(&message.content)?;
        }

        // Count tool calls if present
        if let Some(tool_calls) = &message.tool_calls {
            for tool_call in tool_calls {
                // Tool call overhead
                total += 3;

                // Function name
                total += self.tokenizer.count_tokens(&tool_call.function.name)?;

                // Arguments (serialized as JSON)
                let args_json = serde_json::to_string(&tool_call.function.arguments)
                    .unwrap_or_default();
                total += self.tokenizer.count_tokens(&args_json)?;
            }
        }

        // Tool call ID and name if present
        if message.tool_call_id.is_some() {
            total += 3;
        }
        if let Some(name) = &message.name {
            total += self.tokenizer.count_tokens(name)?;
        }

        Ok(total)
    }

    /// Count tokens in multiple messages
    pub fn count_messages(&self, messages: &[Message]) -> Result<usize> {
        let mut total = 3; // Base overhead for message array

        for message in messages {
            total += self.count_message(message)?;
        }

        Ok(total)
    }

    /// Count tokens in a tool definition
    pub fn count_tool(&self, tool: &Tool) -> Result<usize> {
        let mut total = 3; // Base overhead

        // Tool name
        total += self.tokenizer.count_tokens(&tool.function.name)?;

        // Description
        total += self.tokenizer.count_tokens(&tool.function.description)?;

        // Parameters (serialized as JSON schema)
        let params_json = serde_json::to_string(&tool.function.parameters).unwrap_or_default();
        total += self.tokenizer.count_tokens(&params_json)?;

        Ok(total)
    }

    /// Count tokens in multiple tools
    pub fn count_tools(&self, tools: &[Tool]) -> Result<usize> {
        let mut total = 3; // Base overhead for tools array

        for tool in tools {
            total += self.count_tool(tool)?;
        }

        Ok(total)
    }

    /// Count total tokens for a request (messages + tools)
    pub fn count_request(&self, messages: &[Message], tools: Option<&[Tool]>) -> Result<usize> {
        let mut total = self.count_messages(messages)?;

        if let Some(tools) = tools {
            total += self.count_tools(tools)?;
        }

        Ok(total)
    }

    /// Check if messages fit within context limit
    pub fn fits_context(&self, messages: &[Message], tools: Option<&[Tool]>) -> Result<bool> {
        let count = self.count_request(messages, tools)?;
        Ok(count <= self.tokenizer.max_context_length())
    }

    /// Get the underlying tokenizer
    pub fn tokenizer(&self) -> &T {
        &self.tokenizer
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tokenizer::FallbackEstimator;

    #[test]
    fn test_count_simple_message() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let message = Message::user("Hello, world!");
        let count = counter.count_message(&message).unwrap();

        // Should include role overhead (4) + content tokens (~3)
        assert!(count >= 6 && count <= 10, "Expected 6-10 tokens, got {}", count);
    }

    #[test]
    fn test_count_multiple_messages() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let messages = vec![
            Message::user("Hello"),
            Message::assistant("Hi there"),
        ];

        let count = counter.count_messages(&messages).unwrap();

        // Should include array overhead (3) + 2 messages with overhead
        assert!(count >= 10, "Expected at least 10 tokens, got {}", count);
    }

    #[test]
    fn test_count_tool_definition() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let tool = Tool::new("read_file", "Read a file from disk")
            .parameter("path", "string", "File path", true)
            .build();

        let count = counter.count_tool(&tool).unwrap();

        // Should include overhead + name + description + parameters
        assert!(count >= 10, "Expected at least 10 tokens, got {}", count);
    }

    #[test]
    fn test_count_request_with_tools() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let messages = vec![Message::user("Read my file")];
        let tools = vec![
            Tool::new("read_file", "Read a file")
                .parameter("path", "string", "Path", true)
                .build(),
        ];

        let count = counter.count_request(&messages, Some(&tools)).unwrap();

        // Should include messages + tools
        assert!(count >= 20, "Expected at least 20 tokens, got {}", count);
    }

    #[test]
    fn test_fits_context() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        // Short message should fit
        let short_messages = vec![Message::user("Hello")];
        assert!(counter.fits_context(&short_messages, None).unwrap());

        // Very long message shouldn't fit
        let long_content = "word ".repeat(10000); // ~50k chars = ~12.5k tokens
        let long_messages = vec![Message::user(&long_content)];
        assert!(!counter.fits_context(&long_messages, None).unwrap());
    }

    #[test]
    fn test_count_empty_message() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let message = Message::user("");
        let count = counter.count_message(&message).unwrap();

        // Should still have role overhead
        assert_eq!(count, 4);
    }

    #[test]
    fn test_count_system_message() {
        let tokenizer = FallbackEstimator;
        let counter = MessageTokenCounter::new(tokenizer);

        let message = Message::system("You are a helpful assistant");
        let count = counter.count_message(&message).unwrap();

        // Should include role overhead + content
        assert!(count >= 10, "Expected at least 10 tokens, got {}", count);
    }
}
