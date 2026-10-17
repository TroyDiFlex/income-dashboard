-- Application accounts are independent of email addresses and Google identities.
CREATE TABLE IF NOT EXISTS potok_accounts (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('pending_owner', 'active', 'disabled')),
  created_at INTEGER NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS potok_sources (
  account_id TEXT NOT NULL REFERENCES potok_accounts(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, name_key)
);
CREATE TABLE IF NOT EXISTS potok_entries (
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 0 AND 999999999999),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, source_id, month),
  FOREIGN KEY (account_id, source_id) REFERENCES potok_sources(account_id, id)
);
-- Exact envelopes preserve array order, checksums, historical trash and metadata.
CREATE TABLE IF NOT EXISTS potok_imports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES potok_accounts(id),
  checksum TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  UNIQUE (account_id, checksum)
);
CREATE TABLE IF NOT EXISTS potok_schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
