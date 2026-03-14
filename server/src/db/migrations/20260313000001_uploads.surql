DEFINE TABLE IF NOT EXISTS uploads SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS name        ON uploads TYPE string;
DEFINE FIELD IF NOT EXISTS upload_type ON uploads TYPE string
    ASSERT $value IN ['notion_export'];
DEFINE FIELD IF NOT EXISTS status      ON uploads TYPE string
    ASSERT $value IN ['pending', 'processing', 'completed', 'failed'];
DEFINE FIELD IF NOT EXISTS error       ON uploads TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at  ON uploads TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at  ON uploads TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_uploads_status     ON uploads FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_uploads_type       ON uploads FIELDS upload_type;
DEFINE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads FIELDS created_at;
