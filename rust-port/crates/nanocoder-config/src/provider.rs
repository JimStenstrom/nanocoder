use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Connection pool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionPoolConfig {
    #[serde(rename = "idleTimeout", skip_serializing_if = "Option::is_none")]
    pub idle_timeout: Option<u64>,
    #[serde(rename = "cumulativeMaxIdleTimeout", skip_serializing_if = "Option::is_none")]
    pub cumulative_max_idle_timeout: Option<u64>,
}

/// Provider configuration (OpenAI-compatible)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    #[serde(rename = "baseUrl", skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    pub models: Vec<String>,
    #[serde(rename = "requestTimeout", skip_serializing_if = "Option::is_none")]
    pub request_timeout: Option<u64>,
    #[serde(rename = "socketTimeout", skip_serializing_if = "Option::is_none")]
    pub socket_timeout: Option<i64>,
    #[serde(rename = "organizationId", skip_serializing_if = "Option::is_none")]
    pub organization_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    #[serde(rename = "connectionPool", skip_serializing_if = "Option::is_none")]
    pub connection_pool: Option<ConnectionPoolConfig>,
    #[serde(flatten)]
    pub additional: HashMap<String, serde_json::Value>,
}

/// MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
}
