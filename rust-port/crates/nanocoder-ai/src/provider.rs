//! Provider configuration and registry

use nanocoder_core::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// AI provider identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenAI,
    Anthropic,
}

impl Provider {
    /// Get the provider name as a string
    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::OpenAI => "openai",
            Provider::Anthropic => "anthropic",
        }
    }

    /// Parse a provider from a string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "openai" => Some(Provider::OpenAI),
            "anthropic" | "claude" => Some(Provider::Anthropic),
            _ => None,
        }
    }
}

/// Configuration for an AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Provider type
    pub provider: Provider,
    /// API key
    pub api_key: String,
    /// Custom base URL (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Default model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
}

fn default_timeout() -> u64 {
    30
}

impl ProviderConfig {
    /// Create a new provider configuration
    pub fn new(provider: Provider, api_key: impl Into<String>) -> Self {
        Self {
            provider,
            api_key: api_key.into(),
            base_url: None,
            timeout_secs: default_timeout(),
            default_model: None,
        }
    }

    /// Set a custom base URL
    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Set the timeout
    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.timeout_secs = secs;
        self
    }

    /// Set the default model
    pub fn with_default_model(mut self, model: impl Into<String>) -> Self {
        self.default_model = Some(model.into());
        self
    }

    /// Build an AI client from this configuration
    pub fn build_client(&self) -> Result<Box<dyn crate::client::AiClient>> {
        crate::client::AiClientBuilder::new(self.provider.as_str())
            .api_key(&self.api_key)
            .base_url(self.base_url.clone().unwrap_or_default())
            .timeout_secs(self.timeout_secs)
            .build()
    }
}

/// Registry for managing multiple AI providers
pub struct ProviderRegistry {
    providers: HashMap<String, ProviderConfig>,
    default_provider: Option<String>,
}

impl ProviderRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            default_provider: None,
        }
    }

    /// Register a provider
    pub fn register(&mut self, name: impl Into<String>, config: ProviderConfig) {
        let name = name.into();
        if self.default_provider.is_none() {
            self.default_provider = Some(name.clone());
        }
        self.providers.insert(name, config);
    }

    /// Get a provider configuration by name
    pub fn get(&self, name: &str) -> Option<&ProviderConfig> {
        self.providers.get(name)
    }

    /// Get the default provider configuration
    pub fn get_default(&self) -> Option<&ProviderConfig> {
        self.default_provider
            .as_ref()
            .and_then(|name| self.providers.get(name))
    }

    /// Set the default provider
    pub fn set_default(&mut self, name: impl Into<String>) -> Result<()> {
        let name = name.into();
        if !self.providers.contains_key(&name) {
            return Err(nanocoder_core::Error::Config(format!(
                "Provider '{}' not found",
                name
            )));
        }
        self.default_provider = Some(name);
        Ok(())
    }

    /// List all registered provider names
    pub fn list_providers(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }

    /// Build a client for a specific provider
    pub fn build_client(&self, name: &str) -> Result<Box<dyn crate::client::AiClient>> {
        let config = self
            .get(name)
            .ok_or_else(|| nanocoder_core::Error::Config(format!("Provider '{}' not found", name)))?;
        config.build_client()
    }

    /// Build a client for the default provider
    pub fn build_default_client(&self) -> Result<Box<dyn crate::client::AiClient>> {
        let config = self.get_default().ok_or_else(|| {
            nanocoder_core::Error::Config("No default provider configured".to_string())
        })?;
        config.build_client()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_from_str() {
        assert_eq!(Provider::from_str("openai"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_str("OpenAI"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_str("anthropic"), Some(Provider::Anthropic));
        assert_eq!(Provider::from_str("claude"), Some(Provider::Anthropic));
        assert_eq!(Provider::from_str("unknown"), None);
    }

    #[test]
    fn test_provider_as_str() {
        assert_eq!(Provider::OpenAI.as_str(), "openai");
        assert_eq!(Provider::Anthropic.as_str(), "anthropic");
    }

    #[test]
    fn test_provider_config() {
        let config = ProviderConfig::new(Provider::OpenAI, "test_key")
            .with_timeout(60)
            .with_default_model("gpt-4");

        assert_eq!(config.provider, Provider::OpenAI);
        assert_eq!(config.api_key, "test_key");
        assert_eq!(config.timeout_secs, 60);
        assert_eq!(config.default_model, Some("gpt-4".to_string()));
    }

    #[test]
    fn test_provider_registry() {
        let mut registry = ProviderRegistry::new();

        let config1 = ProviderConfig::new(Provider::OpenAI, "key1");
        let config2 = ProviderConfig::new(Provider::Anthropic, "key2");

        registry.register("openai", config1);
        registry.register("anthropic", config2);

        assert_eq!(registry.list_providers().len(), 2);
        assert!(registry.get("openai").is_some());
        assert!(registry.get("anthropic").is_some());

        // First registered is default
        assert_eq!(registry.get_default().unwrap().provider, Provider::OpenAI);

        // Change default
        registry.set_default("anthropic").unwrap();
        assert_eq!(registry.get_default().unwrap().provider, Provider::Anthropic);
    }

    #[test]
    fn test_provider_registry_set_default_invalid() {
        let mut registry = ProviderRegistry::new();
        let result = registry.set_default("nonexistent");
        assert!(result.is_err());
    }
}
