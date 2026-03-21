-- Define the table as schema-full to enforce types
DEFINE TABLE calls SCHEMAFULL;

-- Fields
DEFINE FIELD duration ON TABLE calls TYPE duration;
DEFINE FIELD start ON TABLE calls TYPE datetime;
DEFINE FIELD end ON TABLE calls TYPE datetime;

-- Relation to users table (Record ID)
DEFINE FIELD user ON TABLE calls TYPE record<users> ASSERT $value != NONE;

-- Metadata
DEFINE FIELD IF NOT EXISTS created_at ON calls TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON calls TYPE datetime DEFAULT time::now();

-- Rating (1-5, Nullable)
DEFINE FIELD rating ON TABLE calls TYPE option<int> 
    ASSERT $value == NONE OR ($value >= 1 AND $value <= 5);