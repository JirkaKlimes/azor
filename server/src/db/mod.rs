mod migrations;

use surrealdb::Surreal;
use surrealdb::engine::any::{self, Any};
use surrealdb::opt::Config;
use surrealdb::opt::auth::Root;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    Surreal(#[from] surrealdb::Error),
}

pub async fn connect(db_uri: &str, db_user: &str, db_pass: &str) -> Result<Surreal<Any>, DbError> {
    let config = Config::new();
    let db = any::connect((db_uri, config)).await?;

    db.signin(Root {
        username: db_user.to_string(),
        password: db_pass.to_string(),
    })
    .await?;

    db.query("DEFINE NAMESPACE IF NOT EXISTS azor").await?;
    db.query("DEFINE DATABASE IF NOT EXISTS main").await?;
    db.use_ns("azor").use_db("main").await?;

    migrations::run(&db).await?;

    Ok(db)
}
