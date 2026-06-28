import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, copyFileSync } from 'fs'
import { SCHEMA_SQL } from './schema'

let db: Database.Database | null = null

/**
 * Returns the canonical data directory: Documents/Job Hunter Pro
 *
 * Storing in Documents (not userData/AppData) means the data survives:
 *  - App uninstall via Windows Programs & Features
 *  - Clearing AppData
 *  - Installing a new version
 *  - Manually deleting the app installation folder
 */
export function getDataDir(): string {
  return join(app.getPath('documents'), 'Job Hunter Pro')
}

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = getDataDir()
    mkdirSync(dataDir, { recursive: true })

    const dbPath = join(dataDir, 'job-hunter.db')

    migrateFromUserData(dbPath)

    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA_SQL)
    runMigrations(db)
    initDefaults(db)
  }
  return db
}

/**
 * One-time migration: if the DB doesn't exist in the new Documents location yet
 * but does exist in the old userData location, copy it across automatically.
 * The old file is left in place as a backup.
 */
function migrateFromUserData(newDbPath: string): void {
  if (existsSync(newDbPath)) return

  const oldDataDir = join(app.getPath('userData'), 'data')
  const oldDbPath = join(oldDataDir, 'job-hunter.db')

  if (existsSync(oldDbPath)) {
    try {
      mkdirSync(join(app.getPath('documents'), 'Job Hunter Pro'), { recursive: true })
      copyFileSync(oldDbPath, newDbPath)
      console.log(`[db] Migrated database from ${oldDbPath} to ${newDbPath}`)
    } catch (err) {
      console.error('[db] Migration from userData failed — starting fresh:', err)
    }
  }
}

function runMigrations(db: Database.Database): void {
  try {
    db.exec(`ALTER TABLE search_runs ADD COLUMN source_errors TEXT NOT NULL DEFAULT '[]'`)
  } catch {
    // Column already exists — safe to ignore
  }
}

function initDefaults(db: Database.Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO profile (id, onboarding_complete) VALUES (1, 0)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO job_preferences (id) VALUES (1)
  `).run()
  db.prepare(`
    INSERT OR IGNORE INTO settings (id) VALUES (1)
  `).run()
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
