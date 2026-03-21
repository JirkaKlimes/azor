DEFINE TABLE IF NOT EXISTS users SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS email         ON users TYPE string;
DEFINE FIELD IF NOT EXISTS password_hash ON users TYPE string;
DEFINE FIELD IF NOT EXISTS created_at    ON users TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at    ON users TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_users_email_unique ON users FIELDS email UNIQUE;
