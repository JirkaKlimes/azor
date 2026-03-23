DEFINE TABLE documents SCHEMAFULL;

DEFINE FIELD upload ON documents TYPE record<uploads>;
DEFINE FIELD content ON documents TYPE string;
DEFINE FIELD content_type ON documents TYPE string ASSERT $value IN ["markdown", "csv"];
DEFINE FIELD source_path ON documents TYPE option<string>;
DEFINE FIELD origin_url ON documents TYPE option<string>;
DEFINE FIELD created_at ON documents TYPE datetime DEFAULT time::now();

DEFINE INDEX documents_upload ON documents FIELDS upload;
