// SQLite 持久化层（node:sqlite，零原生编译依赖）
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'vizgen.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS datasets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT,
  columns_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  row_count INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS versions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  dataset_id INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  engine TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// ---- 迁移：V2 通用应用生成（versions 支持无数据集的应用版本，HTML 直接落库）----
(function migrate() {
  const cols = db.prepare("PRAGMA table_info(versions)").all().map(c => c.name);
  if (!cols.includes('html_text')) {
    db.exec(`
      ALTER TABLE versions RENAME TO versions_old;
      CREATE TABLE versions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        dataset_id INTEGER,
        config_json TEXT NOT NULL,
        html_text TEXT,
        kind TEXT DEFAULT 'dashboard',
        engine TEXT,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO versions(id, project_id, dataset_id, config_json, kind, engine, note, created_at)
        SELECT id, project_id, dataset_id, config_json, 'dashboard', engine, note, created_at FROM versions_old;
      DROP TABLE versions_old;
    `);
    console.log('[db] migrated: versions table supports app versions (html_text/kind)');
  }
  const pcols = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
  if (!pcols.includes('kind')) {
    db.exec("ALTER TABLE projects ADD COLUMN kind TEXT DEFAULT 'dashboard'");
    console.log('[db] migrated: projects table supports kind (app/dashboard)');
  }
})();

module.exports = db;
