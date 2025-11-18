//! nanocoder - A local-first CLI coding agent
//!
//! Brings the power of agentic coding tools to local models
//! or controlled APIs like OpenRouter.

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Enable debug logging
    #[arg(short, long)]
    debug: bool,

    /// Config file path
    #[arg(short, long)]
    config: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize logging
    let filter = if args.debug {
        EnvFilter::new("debug")
    } else {
        EnvFilter::from_default_env()
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    tracing::info!("nanocoder v{} starting", env!("CARGO_PKG_VERSION"));

    // TODO: Initialize application
    println!("nanocoder Rust port - work in progress");

    Ok(())
}
