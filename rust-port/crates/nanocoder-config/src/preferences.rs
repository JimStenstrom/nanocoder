use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    #[serde(rename = "lastProvider", skip_serializing_if = "Option::is_none")]
    pub last_provider: Option<String>,
    #[serde(rename = "lastModel", skip_serializing_if = "Option::is_none")]
    pub last_model: Option<String>,
    #[serde(rename = "providerModels", skip_serializing_if = "Option::is_none")]
    pub provider_models: Option<HashMap<String, String>>,
    #[serde(rename = "lastUpdateCheck", skip_serializing_if = "Option::is_none")]
    pub last_update_check: Option<u64>,
    #[serde(rename = "selectedTheme", skip_serializing_if = "Option::is_none")]
    pub selected_theme: Option<String>,
    #[serde(rename = "trustedDirectories", skip_serializing_if = "Option::is_none")]
    pub trusted_directories: Option<Vec<String>>,
    #[serde(rename = "streamingEnabled", skip_serializing_if = "Option::is_none")]
    pub streaming_enabled: Option<bool>,
}

impl Preferences {
    /// Load preferences from the given path
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        match fs::read_to_string(path) {
            Ok(data) => {
                let prefs: Self = serde_json::from_str(&data)?;
                Ok(prefs)
            }
            Err(_) => {
                // File doesn't exist, return default
                Ok(Self::default())
            }
        }
    }

    /// Save preferences to the given path
    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let json = serde_json::to_string_pretty(self)?;
        fs::write(path, json)?;
        Ok(())
    }

    /// Update the last used provider and model
    pub fn update_last_used(&mut self, provider: impl Into<String>, model: impl Into<String>) {
        let provider = provider.into();
        let model = model.into();

        self.last_provider = Some(provider.clone());
        self.last_model = Some(model.clone());

        // Also save the model for this specific provider
        if self.provider_models.is_none() {
            self.provider_models = Some(HashMap::new());
        }
        if let Some(models) = &mut self.provider_models {
            models.insert(provider, model);
        }
    }

    /// Get the last used model for a provider
    pub fn get_last_used_model(&self, provider: &str) -> Option<&str> {
        self.provider_models
            .as_ref()?
            .get(provider)
            .map(|s| s.as_str())
    }

    /// Check if streaming is enabled (defaults to true)
    pub fn is_streaming_enabled(&self) -> bool {
        self.streaming_enabled.unwrap_or(true)
    }

    /// Set streaming enabled
    pub fn set_streaming_enabled(&mut self, enabled: bool) {
        self.streaming_enabled = Some(enabled);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_save_preferences() {
        let file = NamedTempFile::new().unwrap();
        let prefs = Preferences {
            last_provider: Some("ollama".to_string()),
            last_model: Some("llama3.1:8b".to_string()),
            ..Default::default()
        };

        prefs.save(file.path()).unwrap();
        let loaded = Preferences::load(file.path()).unwrap();

        assert_eq!(loaded.last_provider, Some("ollama".to_string()));
        assert_eq!(loaded.last_model, Some("llama3.1:8b".to_string()));
    }

    #[test]
    fn test_update_last_used() {
        let mut prefs = Preferences::default();
        prefs.update_last_used("ollama", "llama3.1");

        assert_eq!(prefs.last_provider, Some("ollama".to_string()));
        assert_eq!(prefs.last_model, Some("llama3.1".to_string()));
        assert_eq!(prefs.get_last_used_model("ollama"), Some("llama3.1"));
    }

    #[test]
    fn test_streaming_default() {
        let prefs = Preferences::default();
        assert!(prefs.is_streaming_enabled());
    }
}
