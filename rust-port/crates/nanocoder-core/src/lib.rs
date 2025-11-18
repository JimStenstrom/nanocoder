//! Core types and traits for nanocoder
//!
//! This crate contains the fundamental data structures and traits
//! used throughout the nanocoder application, including message types,
//! tool definitions, and core interfaces.

pub mod error;
pub mod message;
pub mod tool;
pub mod types;

pub use error::{Error, Result};
pub use message::{Message, MessageRole, ToolCall, ToolResult};
pub use tool::{Tool, ToolEntry, ToolExecutor, ToolParameters, ValidationResult};
