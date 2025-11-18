use std::path::PathBuf;
use std::env;
use directories::ProjectDirs;

/// Get the app data directory (for usage data, cache, etc.)
pub fn get_app_data_path() -> anyhow::Result<PathBuf> {
    // Allow explicit override via environment variable
    if let Ok(data_dir) = env::var("NANOCODER_DATA_DIR") {
        return Ok(PathBuf::from(data_dir));
    }

    // Check XDG_DATA_HOME first (works cross-platform for testing)
    if let Ok(xdg_data) = env::var("XDG_DATA_HOME") {
        return Ok(PathBuf::from(xdg_data).join("nanocoder"));
    }

    // Use platform-specific app data directories
    if let Some(proj_dirs) = ProjectDirs::from("", "", "nanocoder") {
        Ok(proj_dirs.data_dir().to_path_buf())
    } else {
        // Fallback to home directory
        let home = env::var("HOME")
            .or_else(|_| env::var("USERPROFILE"))
            .map_err(|_| anyhow::anyhow!("Could not determine home directory"))?;
        Ok(PathBuf::from(home).join(".local/share/nanocoder"))
    }
}

/// Get the config directory (for configuration files)
pub fn get_config_path() -> anyhow::Result<PathBuf> {
    // Allow explicit override via environment variable
    if let Ok(config_dir) = env::var("NANOCODER_CONFIG_DIR") {
        return Ok(PathBuf::from(config_dir));
    }

    // Use platform-specific config directories
    if let Some(proj_dirs) = ProjectDirs::from("", "", "nanocoder") {
        Ok(proj_dirs.config_dir().to_path_buf())
    } else {
        // Fallback based on platform
        let home = env::var("HOME")
            .or_else(|_| env::var("USERPROFILE"))
            .map_err(|_| anyhow::anyhow!("Could not determine home directory"))?;

        #[cfg(target_os = "macos")]
        {
            Ok(PathBuf::from(home).join("Library/Preferences/nanocoder"))
        }
        #[cfg(target_os = "windows")]
        {
            let appdata = env::var("APPDATA")
                .unwrap_or_else(|_| format!("{}\\AppData\\Roaming", home));
            Ok(PathBuf::from(appdata).join("nanocoder"))
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let xdg_config = env::var("XDG_CONFIG_HOME")
                .unwrap_or_else(|_| format!("{}/.config", home));
            Ok(PathBuf::from(xdg_config).join("nanocoder"))
        }
    }
}

/// Get the preferences file path
pub fn get_preferences_path() -> anyhow::Result<PathBuf> {
    Ok(get_config_path()?.join("nanocoder-preferences.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_config_path() {
        let path = get_config_path().unwrap();
        assert!(path.to_string_lossy().contains("nanocoder"));
    }

    #[test]
    fn test_get_app_data_path() {
        let path = get_app_data_path().unwrap();
        assert!(path.to_string_lossy().contains("nanocoder"));
    }

    #[test]
    fn test_env_override() {
        env::set_var("NANOCODER_CONFIG_DIR", "/tmp/test-config");
        let path = get_config_path().unwrap();
        assert_eq!(path, PathBuf::from("/tmp/test-config"));
        env::remove_var("NANOCODER_CONFIG_DIR");
    }
}
