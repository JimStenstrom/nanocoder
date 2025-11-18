use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::env;
use crate::provider::{ProviderConfig, McpServerConfig};
use crate::env::substitute_env_vars_json;
use crate::paths::get_config_path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nanocoder: Option<NanocoderConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NanocoderConfig {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<ProviderConfig>,
    #[serde(rename = "mcpServers", default, skip_serializing_if = "Vec::is_empty")]
    pub mcp_servers: Vec<McpServerConfig>,
}

impl Config {
    /// Get the providers from the config
    pub fn providers(&self) -> &[ProviderConfig] {
        self.nanocoder
            .as_ref()
            .map(|n| n.providers.as_slice())
            .unwrap_or(&[])
    }

    /// Get the MCP servers from the config
    pub fn mcp_servers(&self) -> &[McpServerConfig] {
        self.nanocoder
            .as_ref()
            .map(|n| n.mcp_servers.as_slice())
            .unwrap_or(&[])
    }
}

/// Find the closest config file with priority:
/// 1. Current directory (./agents.config.json)
/// 2. Home directory (~/.agents.config.json) - legacy support
/// 3. XDG config directory (~/.config/nanocoder/agents.config.json)
pub fn get_closest_config_file(filename: &str) -> anyhow::Result<PathBuf> {
    // First, check current directory
    let cwd_path = env::current_dir()?.join(filename);
    if cwd_path.exists() {
        return Ok(cwd_path);
    }

    // Next, check home directory (legacy)
    if let Ok(home) = env::var("HOME").or_else(|_| env::var("USERPROFILE")) {
        let home_path = PathBuf::from(home).join(format!(".{}", filename));
        if home_path.exists() {
            return Ok(home_path);
        }
    }

    // Finally, use XDG config directory
    let config_dir = get_config_path()?;
    let config_path = config_dir.join(filename);

    // Create default config if it doesn't exist
    if !config_path.exists() {
        create_default_config_file(&config_path)?;
    }

    Ok(config_path)
}

/// Create a default empty config file
fn create_default_config_file(path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let default_config = serde_json::json!({});
    fs::write(path, serde_json::to_string_pretty(&default_config)?)?;

    Ok(())
}

/// Load .env file from current directory
pub fn load_env() {
    let env_path = env::current_dir()
        .ok()
        .map(|cwd| cwd.join(".env"));

    if let Some(path) = env_path {
        if path.exists() {
            if let Err(e) = dotenvy::from_path(&path) {
                tracing::warn!("Failed to load .env file: {}", e);
            }
        }
    }
}

/// Load the application configuration from agents.config.json
pub fn load_config() -> anyhow::Result<Config> {
    // Load .env file first
    load_env();

    // Find and read config file
    let config_path = get_closest_config_file("agents.config.json")?;

    let raw_data = fs::read_to_string(&config_path)?;
    let mut json: serde_json::Value = serde_json::from_str(&raw_data)?;

    // Apply environment variable substitution
    json = substitute_env_vars_json(json);

    // Deserialize into Config
    let config: Config = serde_json::from_value(json)?;

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::io::Write;

    #[test]
    fn test_load_config_with_providers() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("agents.config.json");

        let config_content = r#"{
            "nanocoder": {
                "providers": [
                    {
                        "name": "ollama",
                        "baseUrl": "http://localhost:11434/v1",
                        "models": ["llama3.1:8b"]
                    }
                ]
            }
        }"#;

        fs::write(&config_path, config_content).unwrap();

        env::set_current_dir(temp_dir.path()).unwrap();
        let config = load_config().unwrap();

        assert_eq!(config.providers().len(), 1);
        assert_eq!(config.providers()[0].name, "ollama");
    }

    #[test]
    fn test_env_substitution_in_config() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("agents.config.json");

        env::set_var("TEST_API_KEY", "secret123");

        let config_content = r#"{
            "nanocoder": {
                "providers": [
                    {
                        "name": "test",
                        "baseUrl": "http://localhost:8000",
                        "apiKey": "${TEST_API_KEY}",
                        "models": ["test-model"]
                    }
                ]
            }
        }"#;

        fs::write(&config_path, config_content).unwrap();

        env::set_current_dir(temp_dir.path()).unwrap();
        let config = load_config().unwrap();

        assert_eq!(config.providers()[0].api_key, Some("secret123".to_string()));

        env::remove_var("TEST_API_KEY");
    }
}
