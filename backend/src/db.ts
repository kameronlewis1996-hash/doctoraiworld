import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/admin.db";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    is_pro INTEGER NOT NULL DEFAULT 0,
    pro_expires_at TEXT,
    is_banned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_queries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pro_codes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    note TEXT,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_by TEXT REFERENCES admins(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS code_redemptions (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL REFERENCES pro_codes(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES app_users(id),
    redeemed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ai_queries_created_at ON ai_queries(created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_queries_user_id ON ai_queries(user_id);
  CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users(created_at);
`);

const defaultSettings: Record<string, string> = {
  pro_price_usd: "9.99",
  pro_price_period: "month",
  announcement_banner: "",
  maintenance_mode: "false",
};

const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)"
);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}
