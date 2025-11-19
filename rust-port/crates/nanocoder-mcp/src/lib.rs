//! Model Context Protocol (MCP) client for nanocoder
//!
//! This crate implements MCP client functionality to connect to
//! external tool servers via stdio transport.

pub mod client;
pub mod protocol;
pub mod transport;

pub use client::McpClient;
pub use protocol::{
    CallToolParams, CallToolResult, InitializeParams, InitializeResult, ListToolsResult, McpInitResult,
    McpServer, McpTool, ToolResultContent,
};
