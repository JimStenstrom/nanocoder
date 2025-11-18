//! Tool implementations for nanocoder
//!
//! This crate provides implementations of all built-in tools:
//! - File operations (read, create, edit, delete)
//! - File search (glob, ripgrep)
//! - Command execution (bash)
//! - Web operations (fetch, search)

pub mod bash;
pub mod file_ops;
pub mod registry;
pub mod search;
pub mod web;

pub use bash::ExecuteBashTool;
pub use file_ops::{
    CreateFileTool, DeleteLinesTool, InsertLinesTool, ReadFileTool, ReplaceLinesTool,
};
pub use registry::ToolRegistry;
pub use search::{FindFilesTool, SearchFileContentsTool};
