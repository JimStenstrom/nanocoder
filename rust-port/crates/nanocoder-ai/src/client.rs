use nanocoder_core::{Message, Result};

pub struct AiClient {
    // TODO: Implement
}

pub struct AiClientBuilder {
    // TODO: Implement
}

impl AiClientBuilder {
    pub fn new() -> Self {
        Self {}
    }

    pub fn build(self) -> Result<AiClient> {
        Ok(AiClient {})
    }
}

impl Default for AiClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl AiClient {
    pub async fn chat(&self, _messages: Vec<Message>) -> Result<Message> {
        // TODO: Implement
        Ok(Message::assistant("placeholder"))
    }
}
