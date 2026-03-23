DEFINE TABLE conversations SCHEMAFULL;

DEFINE FIELD user ON conversations TYPE record<users>;
DEFINE FIELD status ON conversations TYPE string DEFAULT "active" ASSERT $value IN ["active", "completed"];
DEFINE FIELD started_at ON conversations TYPE datetime DEFAULT time::now();
DEFINE FIELD ended_at ON conversations TYPE option<datetime>;
DEFINE FIELD created_at ON conversations TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON conversations TYPE datetime VALUE time::now();

DEFINE INDEX conversations_user ON conversations FIELDS user;
DEFINE INDEX conversations_status ON conversations FIELDS status;
