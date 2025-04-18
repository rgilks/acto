import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as Sentry from '@sentry/nextjs';

const DB_DIR = process.env.NODE_ENV === 'production' ? '/data' : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'acto.sqlite');

const isBuildPhase =
  process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build';

let db: Database.Database | null = null;
let dbProxyInstance: Database.Database | null = null;
let isInitialized = false;

function initializeDatabase(): Database.Database {
  if (db && dbProxyInstance && isInitialized) {
    return dbProxyInstance;
  }

  console.log('[DB] Starting database initialization...');

  try {
    if (isBuildPhase || !fs.existsSync(process.cwd())) {
      db = new Database(':memory:');
      console.log('[DB] Using in-memory database for build phase');
    } else {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
        console.log(`[DB] Created database directory at ${DB_DIR}`);
      }
      db = new Database(DB_PATH);
      console.log(`[DB] Connected to database at ${DB_PATH}`);
    }

    db.pragma('foreign_keys = ON');
    console.log('[DB] Enabled foreign key constraints');
    db.pragma('journal_mode = WAL');
    console.log('[DB] Set journal mode to WAL');

    console.log('[DB] Initializing/verifying database schema...');
    db.exec(`      
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        name TEXT,
        email TEXT,
        image TEXT,
        first_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        language TEXT DEFAULT 'en',
        UNIQUE(provider_id, provider)
      );

      -- New user and API-specific rate limit table
      CREATE TABLE IF NOT EXISTS rate_limits_user (
        user_id INTEGER NOT NULL,
        api_type TEXT NOT NULL, -- e.g., 'text', 'image', 'tts'
        window_start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        request_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, api_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_user_window ON rate_limits_user(user_id, api_type, window_start_time DESC);
    `);

    console.log('[DB] Schema initialization/verification complete');

    dbProxyInstance = db;

    isInitialized = true;
    console.log('[DB] Database initialized successfully.');
    return dbProxyInstance;
  } catch (error) {
    console.error('[DB] Database initialization error:', error);
    Sentry.captureException(error);
    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      console.warn('[DB] CRITICAL: Falling back to in-memory database due to error!');
      db = new Database(':memory:');
      dbProxyInstance = db;
      isInitialized = true;
      return dbProxyInstance;
    }
    throw error;
  }
}

const initializedDbInstance = initializeDatabase();
export default initializedDbInstance;
