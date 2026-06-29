import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import { SCHEMA_SQL } from './schema'

let db: Database.Database | null = null

export function getDataDir(): string {
  return join(homedir(), 'Documents', 'Job Hunter Pro')
}

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = getDataDir()
    mkdirSync(dataDir, { recursive: true })
    db = new Database(join(dataDir, 'job-hunter.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA_SQL)
    runMigrations(db)
    initDefaults(db)
  }
  return db
}

function runMigrations(db: Database.Database): void {
  const migrations = [
    `ALTER TABLE search_runs ADD COLUMN source_errors TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE profile ADD COLUMN raw_cv_text TEXT`,
    `ALTER TABLE applications ADD COLUMN manual_steps TEXT`,
    `ALTER TABLE profile ADD COLUMN languages TEXT NOT NULL DEFAULT '[]'`
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }
}

function initDefaults(db: Database.Database): void {
  db.prepare(`INSERT OR IGNORE INTO profile (id, onboarding_complete) VALUES (1, 0)`).run()
  db.prepare(`INSERT OR IGNORE INTO job_preferences (id) VALUES (1)`).run()
}

export function closeDb(): void {
  if (db) { db.close(); db = null }
}
