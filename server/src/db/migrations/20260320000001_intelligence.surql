DEFINE TABLE IF NOT EXISTS intelligence SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS kind         ON intelligence TYPE string
    ASSERT $value IN ['retrieval', 'highlight', 'summary', 'suggestion', 'processing', 'no_relevant_info'];
DEFINE FIELD IF NOT EXISTS status       ON intelligence TYPE option<string>
    ASSERT $value IN [NONE, 'pending', 'complete'];
DEFINE FIELD IF NOT EXISTS conversation ON intelligence TYPE record<conversations>;
DEFINE FIELD IF NOT EXISTS message      ON intelligence TYPE option<record<messages>>;
DEFINE FIELD IF NOT EXISTS data         ON intelligence TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS created_at   ON intelligence TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_intelligence_conversation ON intelligence FIELDS conversation;
DEFINE INDEX IF NOT EXISTS idx_intelligence_kind         ON intelligence FIELDS kind;
