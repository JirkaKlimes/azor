DEFINE TABLE users SCHEMAFULL;

DEFINE FIELD email ON users TYPE string;
DEFINE FIELD password_hash ON users TYPE string;
DEFINE FIELD created_at ON users TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON users TYPE datetime VALUE time::now();

DEFINE INDEX users_email ON users FIELDS email UNIQUE;
