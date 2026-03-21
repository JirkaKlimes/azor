use std::sync::Arc;

use jsonwebtoken::{DecodingKey, EncodingKey};
use surrealdb::Surreal;
use surrealdb::engine::any::Any;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Surreal<Any>,
    pub jwt_encoding_key: Arc<EncodingKey>,
    pub jwt_decoding_key: Arc<DecodingKey>,
}

impl AppState {
    pub fn new(config: Config, db: Surreal<Any>) -> Self {
        let jwt_encoding_key = Arc::new(EncodingKey::from_secret(config.jwt_secret.as_bytes()));
        let jwt_decoding_key = Arc::new(DecodingKey::from_secret(config.jwt_secret.as_bytes()));

        Self {
            config: Arc::new(config),
            db,
            jwt_encoding_key,
            jwt_decoding_key,
        }
    }
}
