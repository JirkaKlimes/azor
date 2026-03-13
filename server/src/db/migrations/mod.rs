use surrealdb::Surreal;
use surrealdb::engine::any::Any;

include!(concat!(env!("OUT_DIR"), "/migrations.rs"));

pub async fn run(db: &Surreal<Any>) -> Result<(), surrealdb::Error> {
    db.query("DEFINE TABLE IF NOT EXISTS _migrations SCHEMAFULL")
        .await?;
    db.query("DEFINE FIELD IF NOT EXISTS applied_at ON _migrations TYPE datetime")
        .await?;

    for (name, sql) in MIGRATIONS {
        let exists: Option<surrealdb::types::Value> = db
            .query(format!("SELECT * FROM _migrations:{name}"))
            .await?
            .take(0)?;

        if exists.is_none() {
            tracing::info!("Applying migration: {name}");
            let wrapped = format!(
                "BEGIN TRANSACTION;\n{sql}\nCREATE _migrations:{name} SET applied_at = time::now();\nCOMMIT TRANSACTION;"
            );
            db.query(&wrapped).await.map_err(|e| {
                tracing::error!("Failed to apply migration {name}: {e}");
                e
            })?;
        }
    }

    Ok(())
}
