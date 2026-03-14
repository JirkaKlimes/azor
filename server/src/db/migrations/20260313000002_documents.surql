DEFINE TABLE IF NOT EXISTS documents SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS upload       ON documents TYPE record<uploads>;
DEFINE FIELD IF NOT EXISTS content      ON documents TYPE string;
DEFINE FIELD IF NOT EXISTS content_type ON documents TYPE string
    ASSERT $value IN ['markdown', 'csv'];
DEFINE FIELD IF NOT EXISTS source_path  ON documents TYPE option<string>;
DEFINE FIELD IF NOT EXISTS origin_url   ON documents TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at   ON documents TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_documents_upload       ON documents FIELDS upload;
DEFINE INDEX IF NOT EXISTS idx_documents_content_type ON documents FIELDS content_type;

