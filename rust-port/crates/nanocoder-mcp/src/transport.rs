//! Stdio transport for MCP servers
//!
//! Handles spawning and communicating with MCP servers via stdin/stdout.

use nanocoder_core::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

/// JSON-RPC request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// JSON-RPC response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

type ResponseSender = oneshot::Sender<Result<JsonRpcResponse>>;

/// Stdio transport for MCP communication
pub struct StdioTransport {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<ChildStdin>>,
    request_id: Arc<AtomicU64>,
    pending_requests: Arc<Mutex<HashMap<u64, ResponseSender>>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl StdioTransport {
    /// Create a new stdio transport
    pub async fn new(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self> {
        // Spawn the child process
        let mut child = Command::new(command)
            .args(args)
            .env_clear()
            .envs(env)
            // Set log level to ERROR to suppress server logging
            .env("LOG_LEVEL", "ERROR")
            .env("DEBUG", "0")
            .env("VERBOSE", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null()) // Ignore stderr
            .spawn()
            .map_err(|e| {
                nanocoder_core::Error::ToolExecution(format!("Failed to spawn MCP server: {}", e))
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            nanocoder_core::Error::ToolExecution("Failed to get stdin".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            nanocoder_core::Error::ToolExecution("Failed to get stdout".to_string())
        })?;

        let pending_requests: Arc<Mutex<HashMap<u64, ResponseSender>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Create shutdown channel
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        // Spawn stdout reader task
        let pending_requests_clone = pending_requests.clone();
        tokio::spawn(async move {
            Self::read_responses(stdout, pending_requests_clone, &mut shutdown_rx).await;
        });

        Ok(Self {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            request_id: Arc::new(AtomicU64::new(1)),
            pending_requests,
            shutdown_tx: Some(shutdown_tx),
        })
    }

    /// Send a request and wait for response
    pub async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Value::Number(id.into()),
            method: method.to_string(),
            params,
        };

        // Create oneshot channel for response
        let (tx, rx) = oneshot::channel();

        // Register pending request
        self.pending_requests.lock().await.insert(id, tx);

        // Serialize and send request
        let request_json = serde_json::to_string(&request).map_err(|e| {
            nanocoder_core::Error::ToolExecution(format!("Failed to serialize request: {}", e))
        })?;

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(request_json.as_bytes())
            .await
            .map_err(|e| {
                nanocoder_core::Error::ToolExecution(format!("Failed to write to stdin: {}", e))
            })?;
        stdin.write_all(b"\n").await.map_err(|e| {
            nanocoder_core::Error::ToolExecution(format!("Failed to write newline: {}", e))
        })?;
        stdin.flush().await.map_err(|e| {
            nanocoder_core::Error::ToolExecution(format!("Failed to flush stdin: {}", e))
        })?;

        drop(stdin); // Release lock

        // Wait for response
        let response = rx.await.map_err(|_| {
            nanocoder_core::Error::ToolExecution("Request cancelled".to_string())
        })??;

        // Check for error in response
        if let Some(error) = response.error {
            return Err(nanocoder_core::Error::ToolExecution(format!(
                "MCP server error: {} (code: {})",
                error.message, error.code
            )));
        }

        // Return result
        response
            .result
            .ok_or_else(|| nanocoder_core::Error::ToolExecution("No result in response".to_string()))
    }

    /// Read responses from stdout
    async fn read_responses(
        stdout: ChildStdout,
        pending_requests: Arc<Mutex<HashMap<u64, ResponseSender>>>,
        shutdown_rx: &mut mpsc::Receiver<()>,
    ) {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();

        loop {
            // Check for shutdown signal
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    // Parse JSON-RPC response
                    match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                        Ok(response) => {
                            // Extract ID
                            if let Some(id) = response.id.as_u64() {
                                let mut pending = pending_requests.lock().await;
                                if let Some(tx) = pending.remove(&id) {
                                    let _ = tx.send(Ok(response));
                                }
                            }
                        }
                        Err(e) => {
                            tracing::debug!("Failed to parse response: {}", e);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Error reading from stdout: {}", e);
                    break;
                }
            }
        }
    }

    /// Close the transport
    pub async fn close(&mut self) -> Result<()> {
        // Send shutdown signal
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }

        // Kill the child process
        let mut child = self.child.lock().await;
        child.kill().await.map_err(|e| {
            nanocoder_core::Error::ToolExecution(format!("Failed to kill child process: {}", e))
        })?;

        Ok(())
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        // Best effort cleanup
        if let Ok(mut child) = self.child.try_lock() {
            let _ = child.start_kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jsonrpc_request_serialization() {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Value::Number(1.into()),
            method: "test".to_string(),
            params: Some(serde_json::json!({"arg": "value"})),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"test\""));
    }

    #[test]
    fn test_jsonrpc_response_deserialization() {
        let json = r#"{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}"#;
        let response: JsonRpcResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, Value::Number(1.into()));
        assert!(response.result.is_some());
        assert!(response.error.is_none());
    }

    #[test]
    fn test_jsonrpc_error_response() {
        let json = r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Invalid request"}}"#;
        let response: JsonRpcResponse = serde_json::from_str(json).unwrap();
        assert!(response.error.is_some());
        assert_eq!(response.error.unwrap().code, -32600);
    }
}
