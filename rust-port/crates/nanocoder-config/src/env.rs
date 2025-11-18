use std::env;
use regex::Regex;

/// Expand environment variable references in a string
/// Supports both ${VAR_NAME} and $VAR_NAME syntax
/// Also supports default values: ${VAR_NAME:-default}
fn expand_env_var(input: &str) -> String {
    // Regex pattern matches:
    // - ${VAR_NAME} or ${VAR_NAME:-default}
    // - $VAR_NAME
    let re = Regex::new(r"\$\{([A-Z_][A-Z0-9_]*)(?::-(.*?))?\}|\$([A-Z_][A-Z0-9_]*)").unwrap();

    re.replace_all(input, |caps: &regex::Captures| {
        let var_name = caps.get(1)
            .or_else(|| caps.get(3))
            .map(|m| m.as_str())
            .unwrap_or("");

        if var_name.is_empty() {
            return String::new();
        }

        // Try to get the environment variable
        match env::var(var_name) {
            Ok(value) => value,
            Err(_) => {
                // Check if there's a default value
                if let Some(default) = caps.get(2) {
                    default.as_str().to_string()
                } else {
                    tracing::warn!("Environment variable {} not found in config, using empty string", var_name);
                    String::new()
                }
            }
        }
    }).to_string()
}

/// Recursively substitute environment variables in JSON values
pub fn substitute_env_vars_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => serde_json::Value::String(expand_env_var(&s)),
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(
                arr.into_iter()
                    .map(substitute_env_vars_json)
                    .collect()
            )
        }
        serde_json::Value::Object(obj) => {
            serde_json::Value::Object(
                obj.into_iter()
                    .map(|(k, v)| (k, substitute_env_vars_json(v)))
                    .collect()
            )
        }
        other => other,
    }
}

/// Substitute environment variables in a string
pub fn substitute_env_vars(input: &str) -> String {
    expand_env_var(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_substitution() {
        env::set_var("TEST_VAR", "value");
        assert_eq!(substitute_env_vars("${TEST_VAR}"), "value");
        assert_eq!(substitute_env_vars("$TEST_VAR"), "value");
        env::remove_var("TEST_VAR");
    }

    #[test]
    fn test_default_value() {
        env::remove_var("MISSING_VAR");
        assert_eq!(substitute_env_vars("${MISSING_VAR:-default}"), "default");
    }

    #[test]
    fn test_json_substitution() {
        env::set_var("API_KEY", "secret123");
        let json = serde_json::json!({
            "apiKey": "${API_KEY}",
            "nested": {
                "value": "$API_KEY"
            },
            "array": ["${API_KEY}", "other"]
        });

        let result = substitute_env_vars_json(json);
        assert_eq!(result["apiKey"], "secret123");
        assert_eq!(result["nested"]["value"], "secret123");
        assert_eq!(result["array"][0], "secret123");
        env::remove_var("API_KEY");
    }
}
