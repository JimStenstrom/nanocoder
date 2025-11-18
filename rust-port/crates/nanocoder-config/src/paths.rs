use std::path::PathBuf;

pub fn get_config_path() -> anyhow::Result<PathBuf> {
    // TODO: Implement XDG config path resolution
    Ok(PathBuf::from("."))
}

pub fn get_preferences_path() -> anyhow::Result<PathBuf> {
    // TODO: Implement preferences path resolution
    Ok(PathBuf::from("."))
}
