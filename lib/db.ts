import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './db/schema';

const DB_DIR = process.env.NODE_ENV === 'production' ? '/data' : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'acto.sqlite');

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

let betterSqliteInstance: Database.Database | null = null;
let drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function initializeDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (drizzleInstance) {
    return drizzleInstance;
  }

  console.log('[DB] Starting database initialization (Drizzle)...');

  try {
    if (isBuildPhase) {
      console.log('[DB] Using in-memory database for build phase (Drizzle).');
      betterSqliteInstance = new Database(':memory:');
    } else {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
        console.log(`[DB] Created database directory at ${DB_DIR}`);
      }
      console.log(`[DB] Connecting to database at ${DB_PATH} (Drizzle)...`);
      betterSqliteInstance = new Database(DB_PATH);
    }

    betterSqliteInstance.pragma('journal_mode = WAL');
    console.log('[DB] Set journal mode to WAL');
    betterSqliteInstance.pragma('foreign_keys = ON');
    console.log('[DB] Enabled foreign key constraints');

    drizzleInstance = drizzle(betterSqliteInstance, {
      schema,
      logger: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test',
    });

    // Run migrations
    // In a typical setup, you wouldn't run migrations directly in the app like this on every init,
    // but rather via a separate script (e.g., npm run db:migrate).
    // For an existing DB that you're now managing with Drizzle, this is a bit different.
    // If your tables ALREADY exist with the correct structure, migrations might not do much initially
    // or might try to re-create. Drizzle Kit generate will compare schema.ts to the DB.
    if (!isBuildPhase && process.env.NODE_ENV !== 'test') {
      console.log('[DB] Checking for and applying Drizzle migrations...');
      migrate(drizzleInstance, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') });
      console.log('[DB] Drizzle migrations check complete.');
    } else if (process.env.NODE_ENV === 'test') {
      console.log('[DB] Skipping Drizzle migrations for test environment.');
    } else {
      console.log('[DB] Skipping Drizzle migrations for in-memory build phase database.');
      // For in-memory, you might need to ensure schema exists if you don't run migrations.
      // However, Drizzle queries will work against the schema definition directly.
      // If you need the tables to actually exist for some build step that uses the in-memory DB,
      // you might need a way to create them based on schema.ts (e.g. a small utility).
      // For now, assuming build phase doesn't require data access that needs migrations.
    }

    console.log('[DB] Database initialized successfully with Drizzle.');
    return drizzleInstance;
  } catch (error) {
    console.error('[DB] Drizzle Database initialization error:', error);
    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      console.warn('[DB] CRITICAL: Falling back to in-memory database due to error (Drizzle)!');
      betterSqliteInstance = new Database(':memory:');
      drizzleInstance = drizzle(betterSqliteInstance, { schema, logger: true });
      return drizzleInstance;
    }
    throw error;
  }
}

const db = initializeDatabase();
export default db;
