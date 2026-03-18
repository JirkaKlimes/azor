DEFINE TABLE IF NOT EXISTS chunks SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS document        ON chunks TYPE record<documents>;
DEFINE FIELD IF NOT EXISTS upload          ON chunks TYPE record<uploads>;
DEFINE FIELD IF NOT EXISTS content         ON chunks TYPE string;
DEFINE FIELD IF NOT EXISTS chunk_index     ON chunks TYPE int;
DEFINE FIELD IF NOT EXISTS char_offset     ON chunks TYPE int;
DEFINE FIELD IF NOT EXISTS char_length     ON chunks TYPE int;
DEFINE FIELD IF NOT EXISTS embedding       ON chunks TYPE array<float>;
DEFINE FIELD IF NOT EXISTS embedding_model ON chunks TYPE string;
DEFINE FIELD IF NOT EXISTS created_at      ON chunks TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_chunks_document  ON chunks FIELDS document;
DEFINE INDEX IF NOT EXISTS idx_chunks_upload    ON chunks FIELDS upload;

DEFINE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
    FIELDS embedding
    HNSW DIMENSION 1024 DIST COSINE;
