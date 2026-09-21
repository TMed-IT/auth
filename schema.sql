CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  id TEXT UNIQUE NULL,
  given_name TEXT NULL,
  family_name TEXT NULL,
  display_name TEXT NULL,
  avatar TEXT NULL,
  created_at DATETIME NOT NULL,
  consented_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS passkeys (
  credential_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  transports TEXT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);

CREATE TABLE IF NOT EXISTS passkey_authentication_challenges (
  challenge TEXT PRIMARY KEY NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_authentication_challenges_expires_at
  ON passkey_authentication_challenges(expires_at);

CREATE TABLE IF NOT EXISTS emdash_authorization_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emdash_authorization_codes_expires_at
  ON emdash_authorization_codes(expires_at);
