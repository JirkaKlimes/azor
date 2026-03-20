use std::sync::Arc;

use surrealdb::engine::any::Any;
use surrealdb::Surreal;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Surreal<Any>,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(config: Config, db: Surreal<Any>) -> Self {
        Self {
            config: Arc::new(config),
            db,
            http: reqwest::Client::new(),
        }
    }
}
