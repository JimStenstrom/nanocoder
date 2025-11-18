//! Model Context Protocol (MCP) client for nanocoder
//!
//! This crate implements MCP client functionality to connect to
//! external tool servers via stdio transport.

pub mod client;
pub mod transport;

pub use client::McpClient;
