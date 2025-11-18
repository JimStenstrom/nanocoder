//! Nanocoder CLI entry point
//!
//! This binary can run in two modes:
//! 1. Bridge mode: JSON-RPC server over stdin/stdout for TypeScript integration
//! 2. Standalone mode: Direct Rust CLI (future)

use clap::{Parser, Subcommand};
use nanocoder_cli::BridgeServer;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[derive(Parser)]
#[command(name = "nanocoder")]
#[command(about = "AI-powered coding assistant", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the bridge server (JSON-RPC over stdin/stdout)
    Bridge,

    /// Show version information
    Version,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Setup logging
    let log_level = if cli.verbose { "debug" } else { "info" };
    tracing_subscriber::registry()
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            EnvFilter::new(format!("nanocoder={}", log_level))
        }))
        .init();

    match cli.command {
        Some(Commands::Bridge) => {
            tracing::info!("Starting bridge server mode");
            let server = BridgeServer::new();
            server.run().await?;
        }
        Some(Commands::Version) => {
            println!("nanocoder {}", env!("CARGO_PKG_VERSION"));
        }
        None => {
            // Default: run bridge server
            tracing::info!("Starting bridge server mode (default)");
            let server = BridgeServer::new();
            server.run().await?;
        }
    }

    Ok(())
}
