//! Nanocoder CLI library
//!
//! This crate provides the bridge server and CLI utilities for nanocoder.

pub mod bridge;
pub mod server;

pub use bridge::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
pub use server::BridgeServer;
