-- Define the table as schema-full to enforce types
DEFINE TABLE calls SCHEMAFULL;

-- Fields
DEFINE FIELD start ON TABLE calls TYPE datetime;
DEFINE FIELD end ON TABLE calls TYPE option<datetime>;

-- Relation to users table (Record ID)
DEFINE FIELD user ON TABLE calls TYPE record<users> ASSERT $value != NONE;

-- Metadata
DEFINE FIELD IF NOT EXISTS created_at ON calls TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON calls TYPE datetime DEFAULT time::now();

