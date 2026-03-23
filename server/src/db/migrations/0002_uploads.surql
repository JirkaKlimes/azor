DEFINE TABLE uploads SCHEMAFULL;

DEFINE FIELD name ON uploads TYPE string;
DEFINE FIELD upload_type ON uploads TYPE string ASSERT $value IN ["notion_export"];
DEFINE FIELD status ON uploads TYPE string DEFAULT "pending" ASSERT $value IN ["pending", "processing", "completed", "failed"];
DEFINE FIELD error ON uploads TYPE option<string>;
DEFINE FIELD created_at ON uploads TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON uploads TYPE datetime VALUE time::now();
