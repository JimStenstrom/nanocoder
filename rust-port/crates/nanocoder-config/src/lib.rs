//! Configuration management for nanocoder
//!
//! This crate handles loading and managing configuration from various sources:
//! - agents.config.json (current directory, home directory, XDG config)
//! - .env files
//! - Environment variables
//! - User preferences

pub mod config;
pub mod env;
pub mod paths;
pub mod preferences;
pub mod provider;

pub use config::{Config, load_config, load_env, get_closest_config_file};
pub use env::{substitute_env_vars, substitute_env_vars_json};
pub use paths::{get_app_data_path, get_config_path, get_preferences_path};
pub use preferences::Preferences;
pub use provider::{ConnectionPoolConfig, McpServerConfig, ProviderConfig};
