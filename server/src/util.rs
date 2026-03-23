use surrealdb::types::RecordId;

/// Format a SurrealDB RecordId as a string (e.g., "table:id")
pub fn format_record_id(id: &RecordId) -> String {
    match &id.key {
        surrealdb::types::RecordIdKey::String(s) => format!("{}:{s}", id.table),
        surrealdb::types::RecordIdKey::Number(n) => format!("{}:{n}", id.table),
        other => format!("{}:{other:?}", id.table),
    }
}
