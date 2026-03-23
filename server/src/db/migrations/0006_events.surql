DEFINE TABLE events SCHEMAFULL;

DEFINE FIELD conversation ON events TYPE record<conversations>;
DEFINE FIELD kind ON events TYPE string ASSERT $value IN [
    "utterance",
    "message",
    "highlight",
    "summary",
    "suggestion",
    "retrieval",
    "processing",
    "no_relevant_info"
];
DEFINE FIELD role ON events TYPE string ASSERT $value IN ["customer", "operator", "copilot", "system"];
DEFINE FIELD content ON events TYPE string DEFAULT "";
DEFINE FIELD data ON events TYPE option<object> FLEXIBLE;
DEFINE FIELD trigger_event ON events TYPE option<record<events>>;
DEFINE FIELD created_at ON events TYPE datetime DEFAULT time::now();

DEFINE INDEX events_conversation ON events FIELDS conversation;
DEFINE INDEX events_trigger ON events FIELDS trigger_event;
DEFINE INDEX events_kind ON events FIELDS kind;
