DEFINE TABLE IF NOT EXISTS messages SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS conversation ON messages TYPE record<conversations>;
DEFINE FIELD IF NOT EXISTS role       ON messages TYPE string
    ASSERT $value IN ['customer', 'operator'];
DEFINE FIELD IF NOT EXISTS content    ON messages TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON messages TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_messages_conversation ON messages FIELDS conversation;
DEFINE INDEX IF NOT EXISTS idx_messages_role    ON messages FIELDS role;
