use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub nanocoder: NanocoderConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NanocoderConfig {
    #[serde(default)]
    pub providers: Vec<crate::provider::ProviderConfig>,
}

pub fn load_config() -> anyhow::Result<Config> {
    // TODO: Implement config loading
    Ok(Config {
        nanocoder: NanocoderConfig {
            providers: Vec::new(),
        },
    })
}
