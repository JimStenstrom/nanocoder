use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    pub models: Vec<String>,
    #[serde(rename = "requestTimeout", skip_serializing_if = "Option::is_none")]
    pub request_timeout: Option<u64>,
    #[serde(rename = "socketTimeout", skip_serializing_if = "Option::is_none")]
    pub socket_timeout: Option<i64>,
}
