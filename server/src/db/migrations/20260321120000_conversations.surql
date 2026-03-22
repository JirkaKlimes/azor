DEFINE TABLE IF NOT EXISTS conversations SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS call       ON conversations TYPE record<calls>;
DEFINE FIELD IF NOT EXISTS status     ON conversations TYPE string
    ASSERT $value IN ['active', 'completed'];
DEFINE FIELD IF NOT EXISTS created_at ON conversations TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON conversations TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_conversations_call   ON conversations FIELDS call;
DEFINE INDEX IF NOT EXISTS idx_conversations_status ON conversations FIELDS status;
