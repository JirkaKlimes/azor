DEFINE TABLE chunks SCHEMAFULL;

DEFINE FIELD document ON chunks TYPE record<documents>;
DEFINE FIELD upload ON chunks TYPE record<uploads>;
DEFINE FIELD content ON chunks TYPE string;
DEFINE FIELD chunk_index ON chunks TYPE int;
DEFINE FIELD char_offset ON chunks TYPE int;
DEFINE FIELD char_length ON chunks TYPE int;
DEFINE FIELD embedding ON chunks TYPE option<array<float>>;
DEFINE FIELD embedding_model ON chunks TYPE option<string>;
DEFINE FIELD created_at ON chunks TYPE datetime DEFAULT time::now();

DEFINE INDEX chunks_document ON chunks FIELDS document;
DEFINE INDEX chunks_upload ON chunks FIELDS upload;
DEFINE INDEX chunks_embedding ON chunks FIELDS embedding HNSW DIMENSION 1024 DIST COSINE;
