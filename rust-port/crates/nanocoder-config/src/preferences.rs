use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    pub last_provider: Option<String>,
    pub last_model: Option<String>,
}
